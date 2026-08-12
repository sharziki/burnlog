import { prisma } from "./db";

/**
 * Friendships.
 *
 * Stored as a single row per pair rather than two mirrored rows: two rows
 * means two things that can disagree, and "accept" would have to write both
 * atomically. One row with a sorted `pairKey` makes the unique index do the
 * work — a duplicate request in either direction simply can't be inserted.
 *
 * The cost is that every read has to look at both columns, which is what
 * `friendIdsOf` and `statusBetween` encapsulate.
 */

export function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export type FriendStatus = "none" | "pending_out" | "pending_in" | "friends" | "self";

export async function statusBetween(meId: string, otherId: string): Promise<FriendStatus> {
  if (meId === otherId) return "self";
  const row = await prisma.friendship.findUnique({
    where: { pairKey: pairKeyFor(meId, otherId) },
    select: { status: true, requesterId: true },
  });
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  if (row.status === "pending") return row.requesterId === meId ? "pending_out" : "pending_in";
  return "none";
}

/** Accepted friends only. */
export async function friendIdsOf(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export type FriendRequest = {
  id: string;
  user: { id: string; username: string | null; name: string | null; image: string | null };
  createdAt: string;
};

/** Requests waiting on this user to accept or decline. */
export async function incomingRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "pending" },
    include: {
      requester: { select: { id: true, username: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    user: r.requester,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Requests this user has sent that haven't been answered. */
export async function outgoingRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await prisma.friendship.findMany({
    where: { requesterId: userId, status: "pending" },
    include: {
      addressee: { select: { id: true, username: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    user: r.addressee,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type RequestResult =
  | { ok: true; status: FriendStatus }
  | { ok: false; error: string; message: string };

/**
 * Send a request, or auto-accept if they already asked you.
 * Someone requesting back is unambiguous consent, so making them wait for a
 * second click would be silly.
 */
export async function requestFriend(meId: string, otherId: string): Promise<RequestResult> {
  if (meId === otherId) {
    return { ok: false, error: "self", message: "You can't friend yourself." };
  }
  const key = pairKeyFor(meId, otherId);
  const existing = await prisma.friendship.findUnique({ where: { pairKey: key } });

  if (existing) {
    if (existing.status === "accepted") return { ok: true, status: "friends" };
    if (existing.status === "blocked") {
      return { ok: false, error: "blocked", message: "That request can't be sent." };
    }
    // They asked first — treat this as the acceptance.
    if (existing.requesterId === otherId) {
      await prisma.friendship.update({
        where: { pairKey: key },
        data: { status: "accepted", respondedAt: new Date() },
      });
      return { ok: true, status: "friends" };
    }
    return { ok: true, status: "pending_out" };
  }

  await prisma.friendship.create({
    data: { requesterId: meId, addresseeId: otherId, pairKey: key, status: "pending" },
  });
  return { ok: true, status: "pending_out" };
}

export async function respondToRequest(
  meId: string,
  otherId: string,
  accept: boolean,
): Promise<RequestResult> {
  const key = pairKeyFor(meId, otherId);
  const existing = await prisma.friendship.findUnique({ where: { pairKey: key } });
  if (!existing || existing.status !== "pending") {
    return { ok: false, error: "not_pending", message: "No pending request from that user." };
  }
  // Only the addressee may accept; otherwise you could accept your own request.
  if (existing.addresseeId !== meId) {
    return { ok: false, error: "not_yours", message: "That request isn't yours to answer." };
  }

  if (accept) {
    await prisma.friendship.update({
      where: { pairKey: key },
      data: { status: "accepted", respondedAt: new Date() },
    });
    return { ok: true, status: "friends" };
  }
  await prisma.friendship.delete({ where: { pairKey: key } });
  return { ok: true, status: "none" };
}

export async function removeFriend(meId: string, otherId: string): Promise<RequestResult> {
  await prisma.friendship.deleteMany({ where: { pairKey: pairKeyFor(meId, otherId) } });
  return { ok: true, status: "none" };
}

/**
 * People search for the board. Matches username or display name, and reports
 * the viewer's relationship so the UI can show the right button without a
 * second round trip.
 */
export type PersonResult = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  totalTokens: number;
  status: FriendStatus;
};

export async function searchPeople(
  query: string,
  meId: string | null,
  limit = 12,
): Promise<PersonResult[]> {
  const q = query.trim();
  if (!q) return [];

  const users = await prisma.user.findMany({
    where: {
      username: { not: null },
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, username: true, name: true, image: true },
    take: limit,
  });
  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);
  const [totals, friendships] = await Promise.all([
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _sum: { totalTokens: true },
    }),
    meId
      ? prisma.friendship.findMany({
          where: { pairKey: { in: ids.map((id) => pairKeyFor(meId, id)) } },
          select: { pairKey: true, status: true, requesterId: true },
        })
      : Promise.resolve([]),
  ]);

  const totalMap = new Map(totals.map((t) => [t.userId, t._sum.totalTokens ?? 0]));
  const friendMap = new Map(friendships.map((f) => [f.pairKey, f]));

  return users
    .map((u) => {
      let status: FriendStatus = "none";
      if (meId) {
        if (u.id === meId) status = "self";
        else {
          const f = friendMap.get(pairKeyFor(meId, u.id));
          if (f) {
            if (f.status === "accepted") status = "friends";
            else if (f.status === "pending")
              status = f.requesterId === meId ? "pending_out" : "pending_in";
          }
        }
      }
      return {
        id: u.id,
        username: u.username!,
        name: u.name ?? u.username!,
        image: u.image,
        totalTokens: totalMap.get(u.id) ?? 0,
        status,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

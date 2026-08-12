import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import {
  friendIdsOf,
  incomingRequests,
  outgoingRequests,
  removeFriend,
  requestFriend,
  respondToRequest,
} from "@/lib/friends";
import { notifyUser } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Browser session or CLI/MCP bearer key. */
async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) return result.key.userId;
  }
  return null;
}

async function resolveUsername(username: string) {
  return prisma.user.findFirst({
    where: { username },
    select: { id: true, username: true, name: true },
  });
}

export async function GET(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [friendIds, incoming, outgoing] = await Promise.all([
    friendIdsOf(userId),
    incomingRequests(userId),
    outgoingRequests(userId),
  ]);

  const friends = friendIds.length
    ? await prisma.user.findMany({
        where: { id: { in: friendIds } },
        select: { id: true, username: true, name: true, image: true },
      })
    : [];

  return NextResponse.json({ ok: true, friends, incoming, outgoing });
}

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "sign in first" },
      { status: 401 },
    );
  }

  let body: { username?: string; action?: string };
  try {
    body = (await req.json()) as { username?: string; action?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const action = String(body.action ?? "request");
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "missing_username", message: "username required" },
      { status: 400 },
    );
  }

  const target = await resolveUsername(username);
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: `no user @${username}` },
      { status: 404 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  let result;
  switch (action) {
    case "request":
      result = await requestFriend(userId, target.id);
      if (result.ok && result.status === "pending_out") {
        void notifyUser({
          userId: target.id,
          type: "friend_request",
          message: `@${me?.username ?? "someone"} wants to be friends`,
          link: "/settings",
        });
      }
      if (result.ok && result.status === "friends") {
        void notifyUser({
          userId: target.id,
          type: "friend",
          message: `You and @${me?.username ?? "someone"} are now friends`,
          link: `/u/${me?.username ?? ""}`,
        });
      }
      break;
    case "accept":
      result = await respondToRequest(userId, target.id, true);
      if (result.ok) {
        void notifyUser({
          userId: target.id,
          type: "friend",
          message: `@${me?.username ?? "someone"} accepted your friend request`,
          link: `/u/${me?.username ?? ""}`,
        });
      }
      break;
    case "decline":
      result = await respondToRequest(userId, target.id, false);
      break;
    case "remove":
      result = await removeFriend(userId, target.id);
      break;
    default:
      return NextResponse.json(
        { ok: false, error: "bad_action", message: "action must be request/accept/decline/remove" },
        { status: 400 },
      );
  }

  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}

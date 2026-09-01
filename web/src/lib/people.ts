import { prisma } from "./db";

/**
 * People search for the board. Matches username or display name and returns
 * each person's total burn, so a result row can be read as a mini leaderboard
 * entry and linked straight to the public profile.
 *
 * There is deliberately no viewer-relative state here: burnlog has one board,
 * the world's, and looking someone up is a public act with no account attached
 * to it.
 */
export type PersonResult = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  totalTokens: number;
};

export async function searchPeople(query: string, limit = 12): Promise<PersonResult[]> {
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

  const totals = await prisma.burnEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) } },
    _sum: { totalTokens: true },
  });
  const totalMap = new Map(totals.map((t) => [t.userId, Number(t._sum.totalTokens ?? 0)]));

  return users
    .map((u) => ({
      id: u.id,
      username: u.username!,
      name: u.name ?? u.username!,
      image: u.image,
      totalTokens: totalMap.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

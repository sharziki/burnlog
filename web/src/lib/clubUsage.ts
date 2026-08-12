import { prisma } from "./db";

const WEEK = 7 * 24 * 60 * 60 * 1000;

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type ClubUsage = {
  memberTotalMap: Map<string, number>;
  memberWeeklyMap: Map<string, number>;
  memberMonthlyMap: Map<string, number>;
  serviceTotalTokens: number;
  serviceWeeklyTokens: number;
  serviceMonthlyTokens: number;
  totalTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
};

/**
 * Usage for many clubs in a fixed number of queries.
 *
 * The per-club `getClubUsage` runs six queries; calling it in a loop made the
 * clubs list 6×N round-trips and was the reason that page crawled. This does
 * six regardless of how many clubs there are, then partitions in memory.
 */
export async function getClubUsageBatch(
  clubs: { id: string; memberIds: string[] }[],
): Promise<Map<string, ClubUsage>> {
  const result = new Map<string, ClubUsage>();
  if (clubs.length === 0) return result;

  const weekStart = new Date(Date.now() - WEEK);
  const monthStart = monthStartUtc();
  const clubIds = clubs.map((c) => c.id);
  const allMemberIds = [...new Set(clubs.flatMap((c) => c.memberIds))];

  const byUser = (where: object) =>
    allMemberIds.length
      ? prisma.burnEvent.groupBy({
          by: ["userId"],
          where: { userId: { in: allMemberIds }, clubId: null, ...where },
          _sum: { totalTokens: true },
        })
      : Promise.resolve([] as { userId: string; _sum: { totalTokens: number | null } }[]);

  const byClub = (where: object) =>
    prisma.burnEvent.groupBy({
      by: ["clubId"],
      where: { clubId: { in: clubIds }, ...where },
      _sum: { totalTokens: true },
    });

  const [uTotal, uWeek, uMonth, cTotal, cWeek, cMonth] = await Promise.all([
    byUser({}),
    byUser({ timestamp: { gte: weekStart } }),
    byUser({ timestamp: { gte: monthStart } }),
    byClub({}),
    byClub({ timestamp: { gte: weekStart } }),
    byClub({ timestamp: { gte: monthStart } }),
  ]);

  const userMap = (rows: { userId: string; _sum: { totalTokens: number | null } }[]) =>
    new Map(rows.map((r) => [r.userId, r._sum.totalTokens ?? 0]));
  const clubMap = (rows: { clubId: string | null; _sum: { totalTokens: number | null } }[]) =>
    new Map(rows.map((r) => [r.clubId ?? "", r._sum.totalTokens ?? 0]));

  const totalByUser = userMap(uTotal);
  const weekByUser = userMap(uWeek);
  const monthByUser = userMap(uMonth);
  const totalByClub = clubMap(cTotal);
  const weekByClub = clubMap(cWeek);
  const monthByClub = clubMap(cMonth);

  for (const club of clubs) {
    const pick = (src: Map<string, number>) =>
      new Map(club.memberIds.map((id) => [id, src.get(id) ?? 0]));
    const memberTotalMap = pick(totalByUser);
    const memberWeeklyMap = pick(weekByUser);
    const memberMonthlyMap = pick(monthByUser);
    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

    const serviceTotalTokens = totalByClub.get(club.id) ?? 0;
    const serviceWeeklyTokens = weekByClub.get(club.id) ?? 0;
    const serviceMonthlyTokens = monthByClub.get(club.id) ?? 0;

    result.set(club.id, {
      memberTotalMap,
      memberWeeklyMap,
      memberMonthlyMap,
      serviceTotalTokens,
      serviceWeeklyTokens,
      serviceMonthlyTokens,
      totalTokens: sum(memberTotalMap) + serviceTotalTokens,
      weeklyTokens: sum(memberWeeklyMap) + serviceWeeklyTokens,
      monthlyTokens: sum(memberMonthlyMap) + serviceMonthlyTokens,
    });
  }

  return result;
}

export async function getClubUsage(clubId: string, memberIds: string[]): Promise<ClubUsage> {
  const weekStart = new Date(Date.now() - WEEK);
  const monthStart = monthStartUtc();

  const [memberTotals, memberWeekly, memberMonthly, serviceTotal, serviceWeekly, serviceMonthly] =
    await Promise.all([
      memberIds.length
        ? prisma.burnEvent.groupBy({
            by: ["userId"],
            where: { userId: { in: memberIds }, clubId: null },
            _sum: { totalTokens: true },
          })
        : [],
      memberIds.length
        ? prisma.burnEvent.groupBy({
            by: ["userId"],
            where: { userId: { in: memberIds }, clubId: null, timestamp: { gte: weekStart } },
            _sum: { totalTokens: true },
          })
        : [],
      memberIds.length
        ? prisma.burnEvent.groupBy({
            by: ["userId"],
            where: { userId: { in: memberIds }, clubId: null, timestamp: { gte: monthStart } },
            _sum: { totalTokens: true },
          })
        : [],
      prisma.burnEvent.aggregate({
        where: { clubId },
        _sum: { totalTokens: true },
      }),
      prisma.burnEvent.aggregate({
        where: { clubId, timestamp: { gte: weekStart } },
        _sum: { totalTokens: true },
      }),
      prisma.burnEvent.aggregate({
        where: { clubId, timestamp: { gte: monthStart } },
        _sum: { totalTokens: true },
      }),
    ]);

  const memberTotalMap = new Map(memberTotals.map((t) => [t.userId, t._sum.totalTokens ?? 0]));
  const memberWeeklyMap = new Map(memberWeekly.map((t) => [t.userId, t._sum.totalTokens ?? 0]));
  const memberMonthlyMap = new Map(memberMonthly.map((t) => [t.userId, t._sum.totalTokens ?? 0]));
  const memberTotal = [...memberTotalMap.values()].reduce((s, n) => s + n, 0);
  const memberWeek = [...memberWeeklyMap.values()].reduce((s, n) => s + n, 0);
  const memberMonth = [...memberMonthlyMap.values()].reduce((s, n) => s + n, 0);
  const serviceTotalTokens = serviceTotal._sum.totalTokens ?? 0;
  const serviceWeeklyTokens = serviceWeekly._sum.totalTokens ?? 0;
  const serviceMonthlyTokens = serviceMonthly._sum.totalTokens ?? 0;

  return {
    memberTotalMap,
    memberWeeklyMap,
    memberMonthlyMap,
    serviceTotalTokens,
    serviceWeeklyTokens,
    serviceMonthlyTokens,
    totalTokens: memberTotal + serviceTotalTokens,
    weeklyTokens: memberWeek + serviceWeeklyTokens,
    monthlyTokens: memberMonth + serviceMonthlyTokens,
  };
}

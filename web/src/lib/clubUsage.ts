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

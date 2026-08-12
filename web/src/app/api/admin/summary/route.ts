import { NextResponse } from "next/server";
import { isAdminToken } from "@/lib/adminAuth";
import { CLUB_PLANS, clubPlan } from "@/lib/clubPlan";
import { prisma } from "@/lib/db";

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function counts<T extends string | null>(rows: { key: T; count: number }[]) {
  return Object.fromEntries(rows.map((r) => [r.key ?? "unknown", r.count]));
}

export async function GET(req: Request) {
  if (!isAdminToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const since = monthStartUtc();
  const [
    users,
    clubs,
    teamApiKeys,
    leads,
    leadsByStatus,
    leadsBySource,
    clubsByPlan,
    planLimitRows,
    teamSeats,
    mtdTokens,
    recentLeads,
    forcedPlanOverrides,
    recentForcedPlanOverrides,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.club.count(),
    prisma.apiKey.count({ where: { clubId: { not: null } } }),
    prisma.teamLead.count(),
    prisma.teamLead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.teamLead.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.club.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.club.findMany({
      select: {
        plan: true,
        _count: { select: { memberships: true, apiKeys: true } },
      },
    }),
    prisma.clubMembership.count({ where: { club: { plan: "team" } } }),
    prisma.burnEvent.aggregate({ where: { timestamp: { gte: since } }, _sum: { totalTokens: true } }),
    prisma.teamLead.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { email: true, company: true, source: true, status: true, updatedAt: true },
    }),
    prisma.clubAuditEvent.count({
      where: { action: "club_plan_updated", meta: { contains: '"forced":true' } },
    }),
    prisma.clubAuditEvent.findMany({
      where: { action: "club_plan_updated", meta: { contains: '"forced":true' } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        clubId: true,
        meta: true,
        createdAt: true,
        club: { select: { name: true, slug: true, plan: true } },
      },
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      totals: {
        users,
        clubs,
        teamApiKeys,
        leads,
        mtdTokens: Number(mtdTokens._sum.totalTokens ?? 0),
        estimatedMrrUsd: teamSeats * (CLUB_PLANS.team.monthlyPriceUsdPerSeat ?? 0),
        forcedPlanOverrides,
        overLimitClubs: planLimitRows.filter((club) => {
          const limits = CLUB_PLANS[clubPlan(club.plan)];
          return club._count.memberships > limits.memberLimit || club._count.apiKeys > limits.teamKeyLimit;
        }).length,
      },
      leadsByStatus: counts(leadsByStatus.map((r) => ({ key: r.status, count: r._count._all }))),
      leadsBySource: counts(leadsBySource.map((r) => ({ key: r.source, count: r._count._all }))),
      clubsByPlan: counts(clubsByPlan.map((r) => ({ key: r.plan, count: r._count._all }))),
      recentLeads,
      recentForcedPlanOverrides,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

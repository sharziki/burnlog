import { NextResponse } from "next/server";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { getClubUsage } from "@/lib/clubUsage";
import { clubLimits, clubPlan } from "@/lib/clubPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function budgetStatus(used: number, budget: number): "unset" | "ok" | "warning" | "over" {
  if (budget <= 0) return "unset";
  const pct = used / budget;
  if (pct >= 1) return "over";
  if (pct >= 0.8) return "warning";
  return "ok";
}

export async function GET(req: Request) {
  const auth = await authFromBearer(req, { limit: 120 });
  if ("error" in auth) return auth.error;

  const clubs = await prisma.club.findMany({
    where: {
      ...(auth.key.clubId ? { id: auth.key.clubId } : {}),
      memberships: { some: { userId: auth.key.userId } },
    },
    include: {
      owner: { select: { id: true, username: true, name: true } },
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    ok: true,
    username: auth.key.username,
    clubs: await Promise.all(clubs.map(async (club) => {
      const usage = await getClubUsage(club.id, club.memberships.map((m) => m.userId));
      const members = club.memberships
        .map((m) => ({
          username: m.user.username,
          name: m.user.name,
          totalTokens: usage.memberTotalMap.get(m.userId) ?? 0,
          weeklyTokens: usage.memberWeeklyMap.get(m.userId) ?? 0,
          monthlyTokens: usage.memberMonthlyMap.get(m.userId) ?? 0,
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);
      const pct = club.monthlyBudgetTokens > 0
        ? Math.round((usage.monthlyTokens / club.monthlyBudgetTokens) * 100)
        : 0;

      return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        isPrivate: club.isPrivate,
        plan: clubPlan(club.plan),
        limits: clubLimits(club.plan),
        isOwner: club.ownerId === auth.key.userId,
        owner: club.owner,
        memberCount: members.length,
        totalTokens: usage.totalTokens,
        weeklyTokens: usage.weeklyTokens,
        monthlyTokens: usage.monthlyTokens,
        serviceTokens: usage.serviceTotalTokens,
        monthlyBudgetTokens: club.monthlyBudgetTokens,
        monthlyBudgetUsedPct: pct,
        budgetStatus: budgetStatus(usage.monthlyTokens, club.monthlyBudgetTokens),
        members,
      };
    })),
  });
}

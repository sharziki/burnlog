import { NextResponse } from "next/server";
import { isAdminToken } from "@/lib/adminAuth";
import { CLUB_PLANS, clubPlan } from "@/lib/clubPlan";
import { dollarsPerToken } from "@/lib/cost";
import { prisma } from "@/lib/db";

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  if (!isAdminToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const plan = clubPlan(url.searchParams.get("plan"));
  const hasPlanFilter = url.searchParams.has("plan");
  const from = parseDate(url.searchParams.get("from")) ?? monthStartUtc();
  const to = parseDate(url.searchParams.get("to"), true);
  const timestamp = { gte: from, ...(to ? { lt: to } : {}) };
  const clubs = await prisma.club.findMany({
    where: hasPlanFilter ? { plan } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      owner: { select: { email: true, username: true, name: true } },
      memberships: { select: { userId: true } },
      _count: { select: { memberships: true, apiKeys: true } },
    },
  });
  const leadByEmail = new Map(
    (await prisma.teamLead.findMany({
      where: { email: { in: clubs.map((club) => club.owner.email).filter((email): email is string => Boolean(email)) } },
      select: { email: true, company: true, status: true, adminNotes: true, updatedAt: true },
    })).map((lead) => [lead.email.toLowerCase(), lead]),
  );

  const rate = dollarsPerToken();
  const rows = await Promise.all(clubs.map(async (club) => {
    const normalizedPlan = clubPlan(club.plan);
    const limits = CLUB_PLANS[normalizedPlan];
    const monthlyPriceUsdPerSeat = CLUB_PLANS[normalizedPlan].monthlyPriceUsdPerSeat;
    const memberIds = club.memberships.map((m) => m.userId);
    const usage = await prisma.burnEvent.aggregate({
      where: {
        timestamp,
        OR: [
          { clubId: club.id },
          ...(memberIds.length ? [{ userId: { in: memberIds }, clubId: null }] : []),
        ],
      },
      _sum: { totalTokens: true },
    });
    const periodTokens = Number(usage._sum.totalTokens ?? 0);
    const budgetPercentUsed = club.monthlyBudgetTokens > 0
      ? Math.round((periodTokens / club.monthlyBudgetTokens) * 1000) / 10
      : null;
    const budgetStatus = budgetPercentUsed === null
      ? "none"
      : budgetPercentUsed >= 100
        ? "over"
        : budgetPercentUsed >= 80
          ? "warning"
          : "ok";
    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      plan: normalizedPlan,
      owner: club.owner,
      lead: club.owner.email ? leadByEmail.get(club.owner.email.toLowerCase()) ?? null : null,
      memberCount: club._count.memberships,
      teamKeyCount: club._count.apiKeys,
      overPlanMemberCount: Math.max(0, club._count.memberships - limits.memberLimit),
      overPlanTeamKeyCount: Math.max(0, club._count.apiKeys - limits.teamKeyLimit),
      overPlanLimit: club._count.memberships > limits.memberLimit || club._count.apiKeys > limits.teamKeyLimit,
      monthlyPriceUsdPerSeat,
      estimatedMrrUsd: monthlyPriceUsdPerSeat === null ? null : club._count.memberships * monthlyPriceUsdPerSeat,
      periodFrom: from,
      periodTo: to,
      periodTokens,
      estimatedPeriodSpendUsd: periodTokens * rate,
      mtdTokens: periodTokens,
      estimatedMtdSpendUsd: periodTokens * rate,
      monthlyBudgetTokens: club.monthlyBudgetTokens,
      budgetPercentUsed,
      budgetStatus,
      createdAt: club.createdAt,
    };
  }));
  const filteredRows = rows.filter((club) => {
    if (url.searchParams.get("overLimit") === "true" && !club.overPlanLimit) return false;
    if (url.searchParams.get("budgetRisk") === "true" && !["warning", "over"].includes(club.budgetStatus)) return false;
    return true;
  });

  if (url.searchParams.get("format") === "csv") {
    const csvRows = [
      ["id", "name", "slug", "plan", "owner_email", "owner_username", "lead_company", "lead_status", "lead_admin_notes", "member_count", "team_key_count", "over_plan_limit", "over_plan_member_count", "over_plan_team_key_count", "monthly_price_usd_per_seat", "estimated_mrr_usd", "period_from", "period_to", "period_tokens", "estimated_period_spend_usd", "monthly_budget_tokens", "budget_percent_used", "budget_status", "created_at"],
      ...filteredRows.map((club) => [
        club.id,
        club.name,
        club.slug,
        club.plan,
        club.owner.email,
        club.owner.username,
        club.lead?.company,
        club.lead?.status,
        club.lead?.adminNotes,
        club.memberCount,
        club.teamKeyCount,
        club.overPlanLimit,
        club.overPlanMemberCount,
        club.overPlanTeamKeyCount,
        club.monthlyPriceUsdPerSeat,
        club.estimatedMrrUsd,
        club.periodFrom,
        club.periodTo,
        club.periodTokens,
        club.estimatedPeriodSpendUsd,
        club.monthlyBudgetTokens,
        club.budgetPercentUsed,
        club.budgetStatus,
        club.createdAt,
      ]),
    ];
    return new Response(csvRows.map((row) => row.map(csvCell).join(",")).join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="burnlog-admin-clubs.csv"',
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json({ ok: true, clubs: filteredRows }, { headers: { "cache-control": "no-store" } });
}

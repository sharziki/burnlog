import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getClubUsage } from "@/lib/clubUsage";
import { dollarsPerToken } from "@/lib/cost";
import { authFromBearer } from "@/lib/bearerAuth";

const DOLLARS_PER_TOKEN = dollarsPerToken();
const WEEK = 7 * 24 * 60 * 60 * 1000;
const LEGACY_TEAM_KEY = "__team_key_without_api_key_id__";

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function reportAuth(req: Request): Promise<
  | { userId: string; clubId: string | null }
  | { error: NextResponse }
> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (userId) return { userId, clubId: null };

  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const bearer = await authFromBearer(req, { limit: 60 });
    if ("error" in bearer) return bearer;
    return { userId: bearer.key.userId, clubId: bearer.key.clubId };
  }

  return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authed = await reportAuth(req);
  if ("error" in authed) return authed.error;

  const { id } = await params;
  if (authed.clubId && authed.clubId !== id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true, email: true } },
        },
      },
    },
  });

  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!authed.clubId && !club.memberships.some((m) => m.userId === authed.userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"), true);
  const timestamp = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: to } : {}),
  };
  const rangeWhere = Object.keys(timestamp).length ? { timestamp } : {};
  const weekStart = new Date(Date.now() - WEEK);
  const monthStart = monthStartUtc();
  const memberIds = club.memberships.map((m) => m.userId);
  const usage = await getClubUsage(club.id, memberIds);
  const [totals, events, serviceTotals, serviceWeekly, serviceMtd] = await Promise.all([
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: memberIds }, clubId: null, ...rangeWhere },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: memberIds }, clubId: null, ...rangeWhere },
      _count: { _all: true },
      _max: { timestamp: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["apiKeyId"],
      where: { clubId: club.id, ...rangeWhere },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _max: { timestamp: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["apiKeyId"],
      where: { clubId: club.id, timestamp: { gte: weekStart } },
      _sum: { totalTokens: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["apiKeyId"],
      where: { clubId: club.id, timestamp: { gte: monthStart } },
      _sum: { totalTokens: true },
    }),
  ]);

  // BIGINT sums narrow here so the CSV cells and the spend multiplication below
  // stay plain numbers — `bigint * number` throws.
  const totalMap = new Map(
    totals.map((t) => [
      t.userId,
      {
        inputTokens: Number(t._sum.inputTokens ?? 0),
        outputTokens: Number(t._sum.outputTokens ?? 0),
        totalTokens: Number(t._sum.totalTokens ?? 0),
      },
    ]),
  );
  const eventMap = new Map(events.map((e) => [e.userId, e]));
  const serviceKeyIds = serviceTotals.flatMap((s) => (s.apiKeyId ? [s.apiKeyId] : []));
  const serviceKeys = serviceKeyIds.length
    ? await prisma.apiKey.findMany({
        where: { id: { in: serviceKeyIds } },
        select: { id: true, label: true },
      })
    : [];
  const serviceLabelMap = new Map(serviceKeys.map((k) => [k.id, k.label ?? "team key"]));
  const serviceWeeklyMap = new Map(
    serviceWeekly.map((s) => [s.apiKeyId ?? LEGACY_TEAM_KEY, Number(s._sum.totalTokens ?? 0)]),
  );
  const serviceMtdMap = new Map(
    serviceMtd.map((s) => [s.apiKeyId ?? LEGACY_TEAM_KEY, Number(s._sum.totalTokens ?? 0)]),
  );
  const header = [
    "club",
    "from",
    "to",
    "username",
    "name",
    "email",
    "events",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "weekly_tokens",
    "mtd_tokens",
    "club_monthly_budget_tokens",
    "estimated_spend_usd",
    "last_active",
  ];

  const rows: (string | number | null)[][] = club.memberships
    .map((m) => {
      const total = totalMap.get(m.userId);
      const totalTokens = total?.totalTokens ?? 0;
      const weeklyTokens = usage.memberWeeklyMap.get(m.userId) ?? 0;
      const mtdTokens = usage.memberMonthlyMap.get(m.userId) ?? 0;
      return [
        club.name,
        url.searchParams.get("from") ?? "",
        url.searchParams.get("to") ?? "",
        m.user.username,
        m.user.name,
        m.user.email,
        eventMap.get(m.userId)?._count._all ?? 0,
        total?.inputTokens ?? 0,
        total?.outputTokens ?? 0,
        totalTokens,
        weeklyTokens,
        mtdTokens,
        club.monthlyBudgetTokens,
        (totalTokens * DOLLARS_PER_TOKEN).toFixed(2),
        eventMap.get(m.userId)?._max.timestamp?.toISOString() ?? "",
      ];
    })
    .sort((a, b) => Number(b[9]) - Number(a[9]));

  for (const service of serviceTotals.sort((a, b) => Number(b._sum.totalTokens ?? 0) - Number(a._sum.totalTokens ?? 0))) {
    const key = service.apiKeyId ?? LEGACY_TEAM_KEY;
    rows.push([
      club.name,
      url.searchParams.get("from") ?? "",
      url.searchParams.get("to") ?? "",
      "team-key",
      service.apiKeyId ? serviceLabelMap.get(service.apiKeyId) ?? "revoked team key" : "Team API keys",
      "",
      service._count._all,
      Number(service._sum.inputTokens ?? 0),
      Number(service._sum.outputTokens ?? 0),
      Number(service._sum.totalTokens ?? 0),
      serviceWeeklyMap.get(key) ?? 0,
      serviceMtdMap.get(key) ?? 0,
      club.monthlyBudgetTokens,
      (Number(service._sum.totalTokens ?? 0) * DOLLARS_PER_TOKEN).toFixed(2),
      service._max.timestamp?.toISOString() ?? "",
    ]);
  }

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="burnlog-${club.slug}-usage.csv"`,
    },
  });
}

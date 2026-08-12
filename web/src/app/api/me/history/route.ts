import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { impactOf } from "@/lib/impact";
import { dollarsPerToken } from "@/lib/cost";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 400;

/**
 * Long-range usage history for the current user.
 *
 * Aggregated in SQL by day rather than by loading events: six months of heavy
 * agent use is easily hundreds of thousands of rows, and the caller only ever
 * wants the daily curve.
 *
 *   ?days=180   window length (default 180, capped at 400)
 */
export async function GET(req: Request) {
  const session = await auth();
  let userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId && req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) userId = result.key.userId;
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const requested = Number(new URL(req.url).searchParams.get("days") ?? 180);
  const days = Math.min(MAX_DAYS, Math.max(1, Number.isFinite(requested) ? requested : 180));
  const since = new Date(Date.now() - days * DAY);

  const [daily, byModel, bySource, totals] = await Promise.all([
    prisma.$queryRaw<{ day: Date; total: bigint; calls: bigint }[]>`
      SELECT date_trunc('day', "timestamp") AS day,
             SUM("totalTokens")::bigint     AS total,
             COUNT(*)::bigint               AS calls
      FROM "BurnEvent"
      WHERE "userId" = ${userId} AND "timestamp" >= ${since}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.burnEvent.groupBy({
      by: ["model"],
      where: { userId, timestamp: { gte: since } },
      _sum: { totalTokens: true },
      orderBy: { _sum: { totalTokens: "desc" } },
      take: 12,
    }),
    prisma.burnEvent.groupBy({
      by: ["source"],
      where: { userId, timestamp: { gte: since } },
      _sum: { totalTokens: true },
    }),
    prisma.burnEvent.aggregate({
      where: { userId, timestamp: { gte: since } },
      _sum: { totalTokens: true },
      _count: { _all: true },
    }),
  ]);

  // Fill the gaps so the client gets one entry per day and can render a
  // continuous curve without doing calendar maths.
  const byDay = new Map(
    daily.map((d) => [d.day.toISOString().slice(0, 10), { total: Number(d.total), calls: Number(d.calls) }]),
  );
  const series: { date: string; tokens: number; calls: number }[] = [];
  const startMs = Date.now() - (days - 1) * DAY;
  for (let i = 0; i < days; i++) {
    const date = new Date(startMs + i * DAY).toISOString().slice(0, 10);
    const row = byDay.get(date);
    series.push({ date, tokens: row?.total ?? 0, calls: row?.calls ?? 0 });
  }

  const total = Number(totals._sum.totalTokens ?? 0);
  const activeDays = series.filter((s) => s.tokens > 0).length;
  const peak = series.reduce(
    (best, s) => (s.tokens > best.tokens ? s : best),
    { date: "", tokens: 0, calls: 0 },
  );

  // Monthly rollups — the natural unit for "the past 6 months".
  const monthly = new Map<string, number>();
  for (const s of series) {
    const month = s.date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + s.tokens);
  }

  const impact = impactOf(total);

  return NextResponse.json({
    ok: true,
    days,
    totals: {
      tokens: total,
      calls: totals._count._all,
      activeDays,
      dailyAverage: activeDays ? Math.round(total / activeDays) : 0,
      estimatedCostUsd: total * dollarsPerToken(),
    },
    impact: { kwh: impact.kwh, gCo2e: impact.gCo2e, litres: impact.litres },
    peak: peak.date ? peak : null,
    series,
    monthly: [...monthly.entries()].map(([month, tokens]) => ({ month, tokens })),
    models: byModel.map((m) => ({ model: m.model, tokens: Number(m._sum.totalTokens ?? 0) })),
    sources: bySource
      .map((s) => ({ source: s.source, tokens: Number(s._sum.totalTokens ?? 0) }))
      .sort((a, b) => b.tokens - a.tokens),
  });
}

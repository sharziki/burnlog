import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated feed for the embed widget. Deliberately narrow —
 * only what's already visible on the public profile, nothing more.
 * CORS is open because the whole point is rendering on someone else's site.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
  };

  const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  const stats = user ? await getUserStats(user.id) : null;
  if (!stats) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: cors });
  }

  const rank = getRank(stats.totalTokens);
  return NextResponse.json(
    {
      ok: true,
      username: stats.username,
      name: stats.name,
      totalTokens: stats.totalTokens,
      weeklyTokens: stats.weeklyTokens,
      weeklyHistory: stats.weeklyHistory,
      streak: stats.streak,
      rank: rank.name,
      rankIcon: rank.icon,
    },
    { headers: cors },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

import { NextResponse } from "next/server";
import { authFromBearer } from "@/lib/bearerAuth";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authFromBearer(req, { limit: 60 });
  if ("error" in auth) return auth.error;

  const stats = await getUserStats(auth.key.userId);
  if (!stats) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "user not found" },
      { status: 404 },
    );
  }

  const rank = getRank(stats.totalTokens);
  return NextResponse.json({
    ok: true,
    user: {
      username: stats.username,
      name: stats.name,
      bio: stats.bio,
    },
    rank: { name: rank.name, icon: rank.icon, min: rank.min, max: rank.max },
    totals: {
      allTime: stats.totalTokens,
      weekly: stats.weeklyTokens,
      events: stats.commits,
      tokensPerCommit: stats.tokensPerCommit,
      streakDays: stats.streak,
    },
    providers: stats.providers,
    sources: stats.sources,
    topModels: stats.topModels,
    weeklyHistory: stats.weeklyHistory,
  });
}

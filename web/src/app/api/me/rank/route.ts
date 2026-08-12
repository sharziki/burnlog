import { NextResponse } from "next/server";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { getRank } from "@/lib/ranks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authFromBearer(req, { limit: 120 });
  if ("error" in auth) return auth.error;

  // Aggregate totalTokens per user in one query; decide rank from there.
  const totals = await prisma.burnEvent.groupBy({
    by: ["userId"],
    _sum: { totalTokens: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  const myRow = totals.find((t) => t.userId === auth.key.userId);
  const myTotal = Number(myRow?._sum.totalTokens ?? 0);
  const position =
    totals.findIndex((t) => t.userId === auth.key.userId) + 1 || totals.length + 1;
  const rank = getRank(myTotal);

  return NextResponse.json({
    ok: true,
    username: auth.key.username,
    rank: rank.name,
    rankIcon: rank.icon,
    totalTokens: myTotal,
    position,
    totalUsers: totals.length,
  });
}

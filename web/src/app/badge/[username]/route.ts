import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildBadge, buildMissingBadge, type BadgeStyle } from "@/lib/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STYLES: BadgeStyle[] = ["default", "compact", "flat"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const raw = (await params).username;
  // People paste `/badge/name.svg` out of habit; both spellings work.
  const username = raw.replace(/\.svg$/i, "");

  const styleParam = new URL(req.url).searchParams.get("style") as BadgeStyle | null;
  const style: BadgeStyle = styleParam && STYLES.includes(styleParam) ? styleParam : "default";

  const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  if (!user) {
    // 200, not 404: GitHub's image proxy refuses to serve a non-2xx response,
    // so a 404 renders as a broken-image icon and the branded fallback never
    // gets seen. Short TTL so it flips over quickly once the account exists.
    return new NextResponse(buildMissingBadge(), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  }

  const agg = await prisma.burnEvent.aggregate({
    where: { userId: user.id },
    _sum: { totalTokens: true },
  });
  const tokens = Number(agg._sum.totalTokens ?? 0);
  const { svg } = buildBadge(tokens, style);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // 15 minutes: fresh enough to feel live in a README, long enough that a
      // popular profile doesn't hammer the database on every page view.
      "Cache-Control": "public, max-age=900, s-maxage=900",
      ETag: `"${tokens}-${style}"`,
    },
  });
}

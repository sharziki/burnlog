import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function measureText(text: string, fontSize: number): number {
  // Approximate character width for Verdana at given font size
  return text.length * fontSize * 0.62 + 10;
}

function buildBadge(leftText: string, rightText: string, rightBg: string): string {
  const leftWidth = measureText(leftText, 11);
  const rightWidth = measureText(rightText, 11);
  const totalWidth = leftWidth + rightWidth;
  const height = 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="${height}" fill="#1A1A2E"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${escapeXml(rightBg)}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14" fill="#fff">${escapeXml(leftText)}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14" fill="#fff">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: rawUsername } = await params;
  const username = rawUsername.endsWith(".svg") ? rawUsername.slice(0, -4) : rawUsername;

  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true },
  });

  if (!user) {
    const svg = buildBadge("burnlog", "user not found", "#555");
    return new NextResponse(svg, {
      status: 404,
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

  const totalTokens = agg._sum.totalTokens ?? 0;
  const rank = getRank(totalTokens);
  const rightText = `${rank.icon} ${rank.name} \u00B7 ${formatTokens(totalTokens)} tokens`;
  const svg = buildBadge("burnlog", rightText, rank.color === "#FAFAFA" ? "#333" : rank.color);

  const etag = `"${totalTokens}"`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      ETag: etag,
    },
  });
}

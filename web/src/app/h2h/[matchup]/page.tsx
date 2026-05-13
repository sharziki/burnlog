import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseMatchupSlug } from "@/lib/h2h";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { H2HClient } from "./H2HClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ matchup: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchup } = await params;
  const parsed = parseMatchupSlug(matchup);
  if (!parsed) return { title: "H2H — burnlog" };

  const [leftUser, rightUser] = await Promise.all([
    prisma.user.findFirst({ where: { username: parsed.left }, select: { id: true } }),
    prisma.user.findFirst({ where: { username: parsed.right }, select: { id: true } }),
  ]);
  if (!leftUser || !rightUser) return { title: "H2H — burnlog" };

  const [leftStats, rightStats] = await Promise.all([
    getUserStats(leftUser.id),
    getUserStats(rightUser.id),
  ]);
  if (!leftStats || !rightStats) return { title: "H2H — burnlog" };

  const leftRank = getRank(leftStats.totalTokens);
  const rightRank = getRank(rightStats.totalTokens);
  const title = `@${parsed.left} vs @${parsed.right} — H2H · burnlog`;
  const description = `${leftRank.icon} ${parsed.left} (${formatTokens(leftStats.totalTokens)}) vs ${rightRank.icon} ${parsed.right} (${formatTokens(rightStats.totalTokens)}) — who burns more tokens?`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnlog.net";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/h2h/${matchup}`,
      siteName: "burnlog",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function H2HPage({ params }: Props) {
  const { matchup } = await params;
  const parsed = parseMatchupSlug(matchup);
  if (!parsed) notFound();

  const [leftUser, rightUser] = await Promise.all([
    prisma.user.findFirst({ where: { username: parsed.left }, select: { id: true } }),
    prisma.user.findFirst({ where: { username: parsed.right }, select: { id: true } }),
  ]);
  if (!leftUser || !rightUser) notFound();

  const [leftStats, rightStats] = await Promise.all([
    getUserStats(leftUser.id),
    getUserStats(rightUser.id),
  ]);
  if (!leftStats || !rightStats) notFound();

  return <H2HClient left={leftStats} right={rightStats} />;
}

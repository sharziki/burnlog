import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { getAchievements } from "@/lib/achievements";
import { getUserChallenges } from "@/lib/challenges";
import { ProfileClient, type ProfileChallenge } from "./ProfileClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, name: true, image: true, bio: true },
  });
  if (!user) return { title: "User not found" };

  const stats = await getUserStats(user.id);
  if (!stats) return { title: "User not found" };

  const rank = getRank(stats.totalTokens);
  const title = `@${username} — ${rank.name} · ${formatTokens(stats.totalTokens)} tokens`;
  const description = stats.bio
    ? `${stats.bio} — ${formatTokens(stats.totalTokens)} tokens burned, ${stats.streak}d streak`
    : `${formatTokens(stats.totalTokens)} tokens burned across ${stats.commits} sessions. Rank: ${rank.name}. ${stats.streak}d streak.`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnlog.net";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/u/${username}`,
      siteName: "burnlog",
      type: "profile",
      images: [{ url: `${siteUrl}/og/u/${username}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/og/u/${username}`],
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, createdAt: true },
  });
  if (!user) notFound();

  const [stats, achievements, entered] = await Promise.all([
    getUserStats(user.id),
    getAchievements(user.id),
    getUserChallenges(user.id),
  ]);
  if (!stats) notFound();

  const challenges: ProfileChallenge[] = entered.map((c) => {
    const mine = c.standings.find((s) => s.userId === user.id);
    return {
      id: c.id,
      inviteCode: c.inviteCode,
      name: c.name,
      typeLabel: c.typeLabel,
      icon: c.icon,
      place: mine?.place ?? 0,
      won: c.winnerUsername === username,
      ended: c.status === "ended",
    };
  });

  return (
    <ProfileClient
      user={stats}
      joinedAt={user.createdAt.toISOString()}
      achievements={achievements.map((a) => a.key)}
      challenges={challenges}
    />
  );
}

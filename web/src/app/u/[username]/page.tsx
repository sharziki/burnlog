import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { ProfileClient } from "./ProfileClient";

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
      images: user.image ? [{ url: user.image, width: 256, height: 256 }] : undefined,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: user.image ? [user.image] : undefined,
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

  const stats = await getUserStats(user.id);
  if (!stats) notFound();

  return <ProfileClient user={stats} joinedAt={user.createdAt.toISOString()} />;
}

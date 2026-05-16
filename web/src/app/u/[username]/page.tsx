import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

const hasDatabase = Boolean(process.env.DATABASE_URL);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!hasDatabase) notFound();

  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, name: true, image: true, bio: true },
  });
  if (!user) notFound();

  const stats = await getUserStats(user.id);
  if (!stats) notFound();

  const rank = getRank(stats.totalTokens);
  const topSource = stats.sources[0]?.source ? stats.sources[0].source : null;
  const title = `@${username} — ${rank.name} · ${formatTokens(stats.totalTokens)} tracked tokens`;
  const description = stats.bio
    ? `${stats.bio} — ${formatTokens(stats.totalTokens)} tracked tokens across ${stats.commits} sessions${topSource ? ` · top source: ${topSource}` : ""}`
    : `${formatTokens(stats.totalTokens)} tracked tokens across ${stats.commits} sessions${topSource ? ` · top source: ${topSource}` : ""}. Rank: ${rank.name}. ${stats.streak}d streak.`;

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
  if (!hasDatabase) notFound();

  const { username } = await params;
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const viewerUsername = (session?.user as { username?: string } | undefined)?.username ?? null;

  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, createdAt: true },
  });
  if (!user) notFound();

  const stats = await getUserStats(user.id);
  if (!stats) notFound();

  const [followersCount, followingCount, existingFollow] = await Promise.all([
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    viewerId && viewerId !== user.id
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
          select: { id: true },
        })
      : null,
  ]);

  return (
    <ProfileClient
      user={stats}
      joinedAt={user.createdAt.toISOString()}
      social={{
        followersCount,
        followingCount,
        isFollowing: Boolean(existingFollow),
        isAuthenticated: Boolean(viewerId),
        isOwnProfile: Boolean(viewerId && viewerId === user.id),
        viewerUsername,
      }}
    />
  );
}

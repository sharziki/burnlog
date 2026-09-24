import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBoard, getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { getAchievements } from "@/lib/achievements";
import { SITE_URL } from "@/lib/seo";
import { ProfileJsonLd } from "@/components/JsonLd";
import { ProfileClient } from "./ProfileClient";

// Cached per profile and refreshed every minute; nothing here depends on who is looking.
export const revalidate = 60;
// No profiles at build time; each is rendered on its first visit, then cached.
export async function generateStaticParams(): Promise<{ username: string }[]> {
  return [];
}

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

  const siteUrl = SITE_URL;

  return {
    title,
    description,
    alternates: { canonical: `/u/${username}` },
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

  const [stats, achievements, board] = await Promise.all([
    getUserStats(user.id),
    getAchievements(user.id),
    // Standing and neighbours. Also the only links between one profile and the
    // next: without them each profile is an island a crawler reaches only from
    // the sitemap, and internal links are how a page inherits any authority
    // from the pages around it.
    getBoard(),
  ]);
  if (!stats) notFound();

  const place = board.findIndex((u) => u.username === username) + 1;
  const neighbours = board
    .map((u, i) => ({ place: i + 1, username: u.username, name: u.name, image: u.image, totalTokens: u.totalTokens }))
    .filter((u) => u.username !== username && Math.abs(u.place - place) <= 2)
    .slice(0, 4);

  return (
    <>
      <ProfileJsonLd
        username={username}
        name={stats.name}
        image={stats.image}
        bio={stats.bio}
        github={stats.github}
        twitter={stats.twitter}
        website={stats.website}
        totalTokens={stats.totalTokens}
        rank={getRank(stats.totalTokens).name}
      />
      <ProfileClient
        user={stats}
        joinedAt={user.createdAt.toISOString()}
        achievements={achievements.map((a) => a.key)}
        place={place || null}
        neighbours={neighbours}
      />
    </>
  );
}

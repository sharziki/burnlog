import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revalidatePath, unstable_cache } from "next/cache";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getBoard, getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { ProfileJsonLd } from "@/components/JsonLd";
import { AccountControls, type Machine } from "@/components/AccountControls";
import { ProfileClient } from "./ProfileClient";

// Public token stats stay cached even though owner controls need a session.
const cachedUserStats = unstable_cache(getUserStats, ["profile-stats"], { revalidate: 60, tags: ["profile-stats"] });

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, name: true, image: true, bio: true },
  });
  if (!user) return { title: "User not found" };

  const stats = await cachedUserStats(user.id);
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

  const [stats, board, session] = await Promise.all([
    cachedUserStats(user.id),
    // Standing and neighbours. Also the only links between one profile and the
    // next: without them each profile is an island a crawler reaches only from
    // the sitemap, and internal links are how a page inherits any authority
    // from the pages around it.
    getBoard(),
    auth(),
  ]);
  if (!stats) notFound();

  const place = board.findIndex((u) => u.username === username) + 1;
  const neighbours = board
    .map((u, i) => ({ place: i + 1, username: u.username, name: u.name, image: u.image, totalTokens: u.totalTokens }))
    .filter((u) => u.username !== username && Math.abs(u.place - place) <= 2)
    .slice(0, 4);
  const isOwner = (session?.user as { id?: string } | undefined)?.id === user.id;
  const accountControls = isOwner ? await AccountSection({ userId: user.id, username }) : null;

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
        place={place || null}
        neighbours={neighbours}
        isOwner={isOwner}
        accountControls={accountControls}
      />
    </>
  );
}

async function AccountSection({ userId, username }: { userId: string; username: string }) {
  const [profile, keys, perKey] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { bio: true, twitter: true, website: true } }),
    prisma.apiKey.findMany({
      where: { userId, clubId: null },
      select: { id: true, label: true, createdAt: true, lastUsed: true },
      orderBy: [{ lastUsed: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    prisma.burnEvent.groupBy({
      by: ["apiKeyId"],
      where: { userId, apiKeyId: { not: null } },
      _sum: { totalTokens: true },
    }),
  ]);
  const tokensByKey = new Map(perKey.map((r) => [r.apiKeyId, Number(r._sum.totalTokens ?? 0)]));
  const machines: Machine[] = keys.map((k) => ({
    id: k.id,
    label: k.label && k.label !== "cli" && k.label !== "agent" ? k.label : "Machine",
    createdAt: k.createdAt.toISOString(),
    lastUsed: k.lastUsed?.toISOString() ?? null,
    tokens: tokensByKey.get(k.id) ?? 0,
  }));

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  async function disconnectAction(id: string) {
    "use server";
    const current = await auth();
    if ((current?.user as { id?: string } | undefined)?.id !== userId) return;
    await prisma.apiKey.deleteMany({ where: { id, userId, clubId: null } });
    revalidatePath(`/u/${username}`);
  }

  return <AccountControls
    profile={{ bio: profile?.bio ?? "", twitter: profile?.twitter ?? "", website: profile?.website ?? "" }}
    machines={machines}
    signOutAction={signOutAction}
    disconnectAction={disconnectAction}
  />;
}

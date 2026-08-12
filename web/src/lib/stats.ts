import { prisma } from "./db";

export type UserStats = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  image: string | null;
  bio: string | null;
  github: string | null;
  twitter: string | null;
  website: string | null;
  totalTokens: number;
  weeklyTokens: number;
  streak: number;
  longestStreak: number;
  providers: { anthropic: number; openai: number; google: number; other: number };
  sources: { source: string; tokens: number }[];
  topModels: { model: string; tokens: number }[];
  weeklyHistory: number[]; // 7 buckets ending today
  heatmap: number[]; // 84 buckets = 12 weeks x 7 days, chronological oldest→newest
  tokensPerCommit: number;
  commits: number;
  /** Token split, so cost can price cached reads differently from fresh input. */
  buckets: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  lastActive: string | null; // ISO timestamp of most recent burn event
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function getUserStats(userId: string): Promise<UserStats | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // Token columns are BIGINT, so Prisma hands back JS BigInt. Narrow once
  // here and every arithmetic and JSON path below stays plain numbers.
  const events = (
    await prisma.burnEvent.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
    })
  ).map((e) => ({
    ...e,
    inputTokens: Number(e.inputTokens),
    outputTokens: Number(e.outputTokens),
    cacheCreationTokens: Number(e.cacheCreationTokens),
    cacheReadTokens: Number(e.cacheReadTokens),
    totalTokens: Number(e.totalTokens),
  }));

  const total = events.reduce((s, e) => s + e.totalTokens, 0);
  const now = Date.now();

  const weekStart = now - WEEK;
  const weekly = events
    .filter((e) => e.timestamp.getTime() >= weekStart)
    .reduce((s, e) => s + e.totalTokens, 0);

  const providerTotals = { anthropic: 0, openai: 0, google: 0, other: 0 };
  for (const e of events) {
    const p = e.provider as keyof typeof providerTotals;
    if (p in providerTotals) providerTotals[p] += e.totalTokens;
    else providerTotals.other += e.totalTokens;
  }
  const providerSum =
    providerTotals.anthropic +
    providerTotals.openai +
    providerTotals.google +
    providerTotals.other;
  const providers = providerSum
    ? {
        anthropic: providerTotals.anthropic / providerSum,
        openai: providerTotals.openai / providerSum,
        google: providerTotals.google / providerSum,
        other: providerTotals.other / providerSum,
      }
    : { anthropic: 1, openai: 0, google: 0, other: 0 };

  // Weekly history (7 buckets ending today).
  const weeklyHistory: number[] = Array(7).fill(0);
  for (const e of events) {
    const diff = now - e.timestamp.getTime();
    if (diff >= WEEK) continue;
    const bucket = 6 - Math.floor(diff / DAY);
    if (bucket >= 0 && bucket < 7) weeklyHistory[bucket] += e.totalTokens;
  }

  // 12-week heatmap: 84 daily buckets chronological oldest→newest.
  const heatmap: number[] = Array(84).fill(0);
  const heatmapStart = now - 84 * DAY;
  for (const e of events) {
    const t = e.timestamp.getTime();
    if (t < heatmapStart) continue;
    const idx = Math.floor((t - heatmapStart) / DAY);
    if (idx >= 0 && idx < 84) heatmap[idx] += e.totalTokens;
  }

  // Streak.
  const days = new Set(
    events.map((e) => {
      const d = new Date(e.timestamp);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    }),
  );
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now - i * DAY);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (days.has(key)) streak++;
    else if (i > 0) break;
  }

  // Sources breakdown.
  const sourceMap = new Map<string, number>();
  for (const e of events) sourceMap.set(e.source, (sourceMap.get(e.source) ?? 0) + e.totalTokens);
  const sources = [...sourceMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, tokens]) => ({ source, tokens }));

  // Top models.
  const modelMap = new Map<string, number>();
  for (const e of events) modelMap.set(e.model, (modelMap.get(e.model) ?? 0) + e.totalTokens);
  const topModels = [...modelMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([model, tokens]) => ({ model, tokens }));

  const commits = events.length;
  const tokensPerCommit = commits ? Math.round(total / commits) : 0;

  const buckets = events.reduce(
    (acc, e) => ({
      inputTokens: acc.inputTokens + e.inputTokens,
      outputTokens: acc.outputTokens + e.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + e.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens + e.cacheCreationTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  );

  // Use DB-stored longestStreak if available, otherwise fall back to computed streak
  const longestStreak = Math.max(user.longestStreak ?? 0, streak);

  return {
    id: user.id,
    username: user.username ?? user.id,
    name: user.name ?? user.username ?? "anon",
    avatar: initials(user.name ?? user.username ?? "A"),
    image: user.image,
    bio: user.bio,
    github: user.github ?? user.username,
    twitter: user.twitter,
    website: user.website,
    totalTokens: total,
    weeklyTokens: weekly,
    streak,
    longestStreak,
    providers,
    sources,
    topModels,
    weeklyHistory,
    heatmap,
    tokensPerCommit,
    commits,
    buckets,
    lastActive: events.length > 0 ? events[0].timestamp.toISOString() : null,
  };
}

export type LeaderboardScope = {
  /** Restrict to these user ids (friends view, club view). Null = everyone. */
  userIds?: string[] | null;
};

/**
 * The leaderboard, assembled from grouped aggregates.
 *
 * The previous implementation called `getUserStats` per user, and that
 * function loads every burn event a user has ever produced — so rendering the
 * board pulled the entire BurnEvent table into memory and grew linearly with
 * total usage. This does a fixed five grouped queries regardless of how many
 * users or events exist.
 */
export async function getLeaderboard(scope: LeaderboardScope = {}): Promise<UserStats[]> {
  const where =
    scope.userIds === undefined || scope.userIds === null
      ? { username: { not: null } }
      : { username: { not: null }, id: { in: scope.userIds } };

  const users = await prisma.user.findMany({ where });
  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);
  const now = Date.now();
  const weekStart = new Date(now - WEEK);
  const heatmapStart = new Date(now - 84 * DAY);

  const [totals, weekly, daily, providerRows, sourceRows, lastActive] = await Promise.all([
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _sum: { totalTokens: true },
      _count: { _all: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, timestamp: { gte: weekStart } },
      _sum: { totalTokens: true },
    }),
    // Daily buckets for the 12-week heatmap and the 7-day sparkline.
    prisma.$queryRaw<{ userId: string; day: Date; total: bigint }[]>`
      SELECT "userId",
             date_trunc('day', "timestamp") AS day,
             SUM("totalTokens")::bigint     AS total
      FROM "BurnEvent"
      WHERE "userId" = ANY(${ids})
        AND "timestamp" >= ${heatmapStart}
      GROUP BY 1, 2
    `,
    prisma.burnEvent.groupBy({
      by: ["userId", "provider"],
      where: { userId: { in: ids } },
      _sum: { totalTokens: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["userId", "source"],
      where: { userId: { in: ids } },
      _sum: { totalTokens: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _max: { timestamp: true },
    }),
  ]);

  // `_sum` over a BIGINT column comes back as BigInt; Number() here keeps the
  // maps, the sorts, and the JSON response on plain numbers.
  const totalMap = new Map(totals.map((t) => [t.userId, Number(t._sum.totalTokens ?? 0)]));
  const countMap = new Map(totals.map((t) => [t.userId, t._count._all]));
  const weeklyMap = new Map(weekly.map((t) => [t.userId, Number(t._sum.totalTokens ?? 0)]));
  const lastMap = new Map(lastActive.map((t) => [t.userId, t._max.timestamp ?? null]));

  const heatmapStartMs = heatmapStart.getTime();
  const heatmaps = new Map<string, number[]>();
  const daySets = new Map<string, Set<string>>();
  for (const row of daily) {
    const key = row.userId;
    let buckets = heatmaps.get(key);
    if (!buckets) {
      buckets = Array(84).fill(0);
      heatmaps.set(key, buckets);
    }
    const idx = Math.floor((row.day.getTime() - heatmapStartMs) / DAY);
    if (idx >= 0 && idx < 84) buckets[idx] += Number(row.total);

    let days = daySets.get(key);
    if (!days) {
      days = new Set();
      daySets.set(key, days);
    }
    days.add(row.day.toISOString().slice(0, 10));
  }

  const providersByUser = new Map<string, Record<string, number>>();
  for (const row of providerRows) {
    const rec = providersByUser.get(row.userId) ?? {};
    rec[row.provider] = (rec[row.provider] ?? 0) + Number(row._sum.totalTokens ?? 0);
    providersByUser.set(row.userId, rec);
  }

  const sourcesByUser = new Map<string, { source: string; tokens: number }[]>();
  for (const row of sourceRows) {
    const list = sourcesByUser.get(row.userId) ?? [];
    list.push({ source: row.source, tokens: Number(row._sum.totalTokens ?? 0) });
    sourcesByUser.set(row.userId, list);
  }

  /** Consecutive days ending today (or yesterday), from the day set. */
  function streakOf(userId: string): number {
    const days = daySets.get(userId);
    if (!days) return 0;
    let streak = 0;
    for (let i = 0; i < 84; i++) {
      const key = new Date(now - i * DAY).toISOString().slice(0, 10);
      if (days.has(key)) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  const stats: UserStats[] = users.map((user) => {
    const total = totalMap.get(user.id) ?? 0;
    const heatmap = heatmaps.get(user.id) ?? Array(84).fill(0);
    const commits = countMap.get(user.id) ?? 0;

    const providerTotals = providersByUser.get(user.id) ?? {};
    const providerSum = Object.values(providerTotals).reduce((s, n) => s + n, 0);
    const share = (k: string) => (providerSum ? (providerTotals[k] ?? 0) / providerSum : 0);
    const providers = providerSum
      ? {
          anthropic: share("anthropic"),
          openai: share("openai"),
          google: share("google"),
          other: share("other"),
        }
      : { anthropic: 1, openai: 0, google: 0, other: 0 };

    const streak = streakOf(user.id);
    const last = lastMap.get(user.id) ?? null;

    return {
      id: user.id,
      username: user.username ?? user.id,
      name: user.name ?? user.username ?? "anon",
      avatar: initials(user.name ?? user.username ?? "A"),
      image: user.image,
      bio: user.bio,
      github: user.github ?? user.username,
      twitter: user.twitter,
      website: user.website,
      totalTokens: total,
      weeklyTokens: weeklyMap.get(user.id) ?? 0,
      streak,
      longestStreak: Math.max(user.longestStreak ?? 0, streak),
      providers,
      sources: (sourcesByUser.get(user.id) ?? []).sort((a, b) => b.tokens - a.tokens),
      // Per-model detail is a profile concern; the board never renders it and
      // fetching it here would mean another wide group-by.
      topModels: [],
      weeklyHistory: heatmap.slice(-7),
      heatmap,
      tokensPerCommit: commits ? Math.round(total / commits) : 0,
      commits,
      // The board renders no cost figure, so the split isn't worth another
      // wide group-by here; the profile computes it from full stats.
      buckets: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      lastActive: last ? last.toISOString() : null,
    };
  });

  return stats.sort((a, b) => b.totalTokens - a.totalTokens);
}

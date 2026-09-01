import { prisma } from "./db";
import { unstable_cache } from "next/cache";

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

/**
 * One user's stats, assembled from grouped aggregates.
 *
 * This used to open with `prisma.burnEvent.findMany({ where: { userId } })` —
 * every event the user had ever produced, every column, no limit — and then
 * reduce the array eleven times in JavaScript. The board was fixed for exactly
 * this reason (see getLeaderboard below); the profile page was not, so it kept
 * pulling the heaviest user's entire history across the public internet from
 * Postgres on runtime-01 on every single load. Measured at 8-10s for a
 * 13,000-event account, against 0.6s for the whole leaderboard.
 *
 * Everything below is derivable from aggregates, so none of those rows ever
 * needed to travel. The daily rollup covers both the 84-day heatmap and the
 * 7-day sparkline, since the last seven days are a subset of the last
 * twelve weeks, and it doubles as the day-set the streak walks.
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const now = Date.now();
  const weekStart = new Date(now - WEEK);
  const heatmapStart = new Date(now - 84 * DAY);
  const where = { userId };

  const [agg, weeklyAgg, providerRows, sourceRows, modelRows, daily] = await Promise.all([
    prisma.burnEvent.aggregate({
      where,
      _sum: {
        totalTokens: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
      },
      _count: { _all: true },
      _max: { timestamp: true },
    }),
    prisma.burnEvent.aggregate({
      where: { ...where, timestamp: { gte: weekStart } },
      _sum: { totalTokens: true },
    }),
    prisma.burnEvent.groupBy({ by: ["provider"], where, _sum: { totalTokens: true } }),
    prisma.burnEvent.groupBy({ by: ["source"], where, _sum: { totalTokens: true } }),
    prisma.burnEvent.groupBy({ by: ["model"], where, _sum: { totalTokens: true } }),
    prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "timestamp") AS day,
             SUM("totalTokens")::bigint     AS total
      FROM "BurnEvent"
      WHERE "userId" = ${userId}
        AND "timestamp" >= ${heatmapStart}
      GROUP BY 1
    `,
  ]);

  const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

  const total = num(agg._sum.totalTokens);
  const weekly = num(weeklyAgg._sum.totalTokens);
  const commits = agg._count._all;
  const lastActive = agg._max.timestamp ?? null;

  const buckets = {
    inputTokens: num(agg._sum.inputTokens),
    outputTokens: num(agg._sum.outputTokens),
    cacheReadTokens: num(agg._sum.cacheReadTokens),
    cacheCreationTokens: num(agg._sum.cacheCreationTokens),
  };

  const providerTotals: Record<string, number> = {};
  for (const r of providerRows) {
    providerTotals[r.provider] = (providerTotals[r.provider] ?? 0) + num(r._sum.totalTokens);
  }
  const providerSum = Object.values(providerTotals).reduce((a, b) => a + b, 0);
  const share = (k: string) => (providerSum ? (providerTotals[k] ?? 0) / providerSum : 0);
  const providers = providerSum
    ? {
        anthropic: share("anthropic"),
        openai: share("openai"),
        google: share("google"),
        // "other" is every provider that isn't one of the three named above,
        // so it is the remainder rather than a bucket of its own.
        other: Math.max(0, 1 - share("anthropic") - share("openai") - share("google")),
      }
    : { anthropic: 1, openai: 0, google: 0, other: 0 };

  const sources = sourceRows
    .map((r) => ({ source: r.source, tokens: num(r._sum.totalTokens) }))
    .sort((a, b) => b.tokens - a.tokens);

  const topModels = modelRows
    .map((r) => ({ model: r.model, tokens: num(r._sum.totalTokens) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  // Daily rollup → heatmap, sparkline, and the day set the streak walks.
  const heatmapStartMs = heatmapStart.getTime();
  const heatmap: number[] = Array(84).fill(0);
  const weeklyHistory: number[] = Array(7).fill(0);
  const days = new Set<string>();
  for (const row of daily) {
    const t = row.day.getTime();
    const value = num(row.total);

    const idx = Math.floor((t - heatmapStartMs) / DAY);
    if (idx >= 0 && idx < 84) heatmap[idx] += value;

    const diff = now - t;
    if (diff < WEEK) {
      const bucket = 6 - Math.floor(diff / DAY);
      if (bucket >= 0 && bucket < 7) weeklyHistory[bucket] += value;
    }

    days.add(row.day.toISOString().slice(0, 10));
  }

  // Consecutive days ending today (or yesterday). Bounded by the rollup window,
  // same as the board — a streak longer than twelve weeks reads as 84 there too,
  // and the stored longestStreak below is what carries the real record.
  let streak = 0;
  for (let i = 0; i < 84; i++) {
    const key = new Date(now - i * DAY).toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break;
  }

  const tokensPerCommit = commits ? Math.round(total / commits) : 0;
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
    lastActive: lastActive ? lastActive.toISOString() : null,
  };
}

export type LeaderboardScope = {
  /** Restrict to these user ids (club view). Null = everyone. */
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

  // The world board shows burners, not signups. Six of the first eight accounts
  // had never synced, so three quarters of the leaderboard read "awaiting first
  // burn" and the header called all eight "active burners" — a board that looks
  // abandoned, and an average dragged toward zero by people who burned nothing.
  //
  // A scoped board (a club) keeps everyone: there, an empty row is a member of
  // a group you joined, and their zero is information rather than noise.
  const worldBoard = scope.userIds === undefined || scope.userIds === null;
  const visible = worldBoard ? stats.filter((u) => u.totalTokens > 0) : stats;

  return visible.sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * The world board, cached for half a minute.
 *
 * Every visitor to `/` and to every profile page was triggering the seven
 * queries above — one findMany plus six grouped aggregates — against a
 * Postgres that lives across the public internet, serialised through a
 * five-connection pool. Measured before this existed: a single request took
 * ~0.5s warm, and thirty concurrent requests took 2.6s at the median. That
 * curve does not survive a front page.
 *
 * The board is the same for everyone, so there is nothing per-user to protect:
 * caching it is not a compromise, it is the correct shape. Thirty seconds of
 * staleness on a leaderboard is invisible — the number moves when somebody
 * syncs, not when somebody looks — and it converts a spike from "one fan-out
 * per visitor" into "one per thirty seconds".
 *
 * Scoped boards (a club) are deliberately not cached: they are rare, they are
 * per-club, and caching them would need a key per club for no measured win.
 */
const cachedWorldBoard = unstable_cache(async () => getLeaderboard(), ["leaderboard-world"], {
  revalidate: 30,
  tags: ["leaderboard"],
});

export async function getBoard(scope: LeaderboardScope = {}): Promise<UserStats[]> {
  const world = scope.userIds === undefined || scope.userIds === null;
  return world ? cachedWorldBoard() : getLeaderboard(scope);
}

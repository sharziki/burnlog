import { prisma } from "./db";
import { notifyUser } from "./notifications";

/**
 * Achievements are derived, never incrementally counted. We recompute the
 * facts from BurnEvent after each ingest and insert any newly-earned rows.
 * That means an achievement can never drift out of sync with the data, and
 * backfilling a new achievement is just "add it to the catalog".
 */

export type Achievement = {
  key: string;
  name: string;
  icon: string;
  /** Shown on the locked state — tells you exactly how to get it. */
  how: string;
  /** Rough rarity, drives the card treatment. */
  tier: "common" | "rare" | "epic" | "legendary";
};

export const ACHIEVEMENTS: Achievement[] = [
  // ---- volume ----
  { key: "first-burn", name: "First Burn", icon: "✳", how: "Sync any tokens at all", tier: "common" },
  { key: "first-million", name: "First Million", icon: "◎", how: "Burn 1M tokens total", tier: "common" },
  { key: "mega-burner", name: "Mega Burner", icon: "◆", how: "Burn 10M tokens total", tier: "epic" },
  { key: "quasar", name: "Quasar", icon: "✧", how: "Burn 100M tokens total", tier: "epic" },
  { key: "billion-club", name: "Billion Club", icon: "✦", how: "Burn 1B tokens total", tier: "legendary" },
  { key: "ten-billion", name: "Event Horizon", icon: "◈", how: "Burn 10B tokens total", tier: "legendary" },
  { key: "heat-death", name: "Heat Death", icon: "∞", how: "Burn 100B tokens total", tier: "legendary" },
  { key: "vacuum-decay", name: "Vacuum Decay", icon: "★", how: "Burn 1T tokens total", tier: "legendary" },

  // ---- intensity ----
  { key: "week-warrior", name: "Week Warrior", icon: "⚔", how: "Burn 3M+ tokens in a single week", tier: "rare" },
  { key: "big-day", name: "Big Day", icon: "▮", how: "Burn 10M+ tokens in a single day", tier: "rare" },
  { key: "whale", name: "Whale", icon: "≋", how: "Burn 1B+ tokens in a single day", tier: "legendary" },

  // ---- habit ----
  { key: "on-fire", name: "On Fire", icon: "▲", how: "Hit a 7-day burn streak", tier: "common" },
  { key: "unstoppable", name: "Unstoppable", icon: "⚡", how: "Hit a 30-day burn streak", tier: "epic" },
  { key: "centurion", name: "Centurion", icon: "♛", how: "Hit a 100-day burn streak", tier: "legendary" },
  { key: "regular", name: "Regular", icon: "▦", how: "Burn on 100 separate days", tier: "rare" },
  { key: "year-one", name: "Year One", icon: "◷", how: "Burn on 365 separate days", tier: "legendary" },
  { key: "comeback", name: "Comeback", icon: "↺", how: "Return after 30+ days away", tier: "rare" },

  // ---- breadth ----
  { key: "multi-tool", name: "Multi-Tool", icon: "⌗", how: "Burn from 3 different agents", tier: "rare" },
  { key: "provider-agnostic", name: "Provider Agnostic", icon: "⇄", how: "Use 3+ providers in one week", tier: "rare" },
  { key: "polyglot", name: "Polyglot", icon: "❖", how: "Burn on 10+ distinct models", tier: "epic" },

  // ---- craft ----
  { key: "efficient-machine", name: "Efficient Machine", icon: "◇", how: "Stay under 1K tokens/call across 50+ calls", tier: "rare" },
  { key: "cache-master", name: "Cache Master", icon: "⊞", how: "Get 70%+ of your tokens from cache reads", tier: "epic" },

  // ---- odd hours ----
  { key: "night-owl", name: "Night Owl", icon: "☾", how: "Burn tokens between midnight and 5am", tier: "rare" },
  { key: "early-bird", name: "Early Bird", icon: "☀", how: "Burn tokens between 5am and 7am", tier: "rare" },
  { key: "weekend-warrior", name: "Weekend Warrior", icon: "◑", how: "Burn on 20+ weekend days", tier: "rare" },

  // ---- competition ----
  { key: "duelist", name: "Duelist", icon: "†", how: "Win a challenge", tier: "epic" },
  { key: "champion", name: "Champion", icon: "♚", how: "Win 5 challenges", tier: "legendary" },
];

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export const TIER_COLOR: Record<Achievement["tier"], string> = {
  common: "#71717A",
  rare: "#D97706",
  epic: "#EF4444",
  legendary: "#A855F7",
};

/** Everything the catalog needs to decide what's earned. */
type Facts = {
  totalTokens: number;
  calls: number;
  distinctSources: number;
  distinctModels: number;
  nightCalls: number;
  earlyCalls: number;
  cacheReadTokens: number;
  bestWeekTokens: number;
  bestDayTokens: number;
  activeDays: number;
  weekendDays: number;
  maxGapDays: number;
  maxProvidersInAWeek: number;
  longestStreak: number;
  challengeWins: number;
};

/** Predicates live next to the catalog so adding an achievement is one edit. */
const EARNED: Record<string, (f: Facts) => boolean> = {
  // volume
  "first-burn": (f) => f.totalTokens > 0,
  "first-million": (f) => f.totalTokens >= 1_000_000,
  "mega-burner": (f) => f.totalTokens >= 10_000_000,
  quasar: (f) => f.totalTokens >= 100_000_000,
  "billion-club": (f) => f.totalTokens >= 1_000_000_000,
  "ten-billion": (f) => f.totalTokens >= 10_000_000_000,
  "heat-death": (f) => f.totalTokens >= 100_000_000_000,
  "vacuum-decay": (f) => f.totalTokens >= 1_000_000_000_000,

  // intensity
  "week-warrior": (f) => f.bestWeekTokens >= 3_000_000,
  "big-day": (f) => f.bestDayTokens >= 10_000_000,
  whale: (f) => f.bestDayTokens >= 1_000_000_000,

  // habit
  "on-fire": (f) => f.longestStreak >= 7,
  unstoppable: (f) => f.longestStreak >= 30,
  centurion: (f) => f.longestStreak >= 100,
  regular: (f) => f.activeDays >= 100,
  "year-one": (f) => f.activeDays >= 365,
  comeback: (f) => f.maxGapDays >= 30,

  // breadth
  "multi-tool": (f) => f.distinctSources >= 3,
  "provider-agnostic": (f) => f.maxProvidersInAWeek >= 3,
  polyglot: (f) => f.distinctModels >= 10,

  // craft
  "efficient-machine": (f) => f.calls >= 50 && f.totalTokens / f.calls < 1_000,
  "cache-master": (f) => f.totalTokens > 0 && f.cacheReadTokens / f.totalTokens >= 0.7,

  // odd hours
  "night-owl": (f) => f.nightCalls > 0,
  "early-bird": (f) => f.earlyCalls > 0,
  "weekend-warrior": (f) => f.weekendDays >= 20,

  // competition
  duelist: (f) => f.challengeWins > 0,
  champion: (f) => f.challengeWins >= 5,
};

async function gatherFacts(userId: string): Promise<Facts> {
  const [totals, weeks, best, user, wins, days] = await Promise.all([
    prisma.$queryRaw<
      {
        total: bigint;
        calls: bigint;
        sources: number;
        models: number;
        night: bigint;
        early: bigint;
        cache: bigint;
      }[]
    >`
      SELECT COALESCE(SUM("totalTokens"), 0)::bigint     AS total,
             COUNT(*)::bigint                            AS calls,
             COUNT(DISTINCT source)::int                 AS sources,
             COUNT(DISTINCT model)::int                  AS models,
             COALESCE(SUM("cacheReadTokens"), 0)::bigint AS cache,
             COUNT(*) FILTER (
               WHERE EXTRACT(HOUR FROM "timestamp" AT TIME ZONE 'UTC') < 5
             )::bigint                                   AS night,
             COUNT(*) FILTER (
               WHERE EXTRACT(HOUR FROM "timestamp" AT TIME ZONE 'UTC') BETWEEN 5 AND 6
             )::bigint                                   AS early
      FROM "BurnEvent"
      WHERE "userId" = ${userId}
    `,
    // Most distinct providers inside any single calendar week.
    prisma.$queryRaw<{ max_providers: number | null }[]>`
      SELECT MAX(c)::int AS max_providers FROM (
        SELECT COUNT(DISTINCT provider) AS c
        FROM "BurnEvent"
        WHERE "userId" = ${userId}
        GROUP BY date_trunc('week', "timestamp")
      ) w
    `,
    // Heaviest rolling 7-day window, computed over daily rollups.
    prisma.$queryRaw<{ best: bigint | null }[]>`
      SELECT MAX(window_sum)::bigint AS best FROM (
        SELECT SUM(daily_sum) OVER (
          ORDER BY d RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
        ) AS window_sum
        FROM (
          SELECT date_trunc('day', "timestamp") AS d, SUM("totalTokens") AS daily_sum
          FROM "BurnEvent"
          WHERE "userId" = ${userId}
          GROUP BY 1
        ) daily
      ) rolling
    `,
    prisma.user.findUnique({
      where: { id: userId },
      select: { longestStreak: true, currentStreak: true },
    }),
    prisma.challenge.count({ where: { winnerId: userId } }),
    // Daily rollup drives best-day, active-days, weekend-days, and the
    // longest idle gap — all cheap once the days are grouped.
    prisma.$queryRaw<
      { best_day: bigint | null; active: bigint; weekend: bigint; max_gap: number | null }[]
    >`
      WITH daily AS (
        SELECT date_trunc('day', "timestamp") AS d, SUM("totalTokens") AS total
        FROM "BurnEvent" WHERE "userId" = ${userId} GROUP BY 1
      ), gaps AS (
        SELECT d, d - LAG(d) OVER (ORDER BY d) AS gap FROM daily
      )
      SELECT (SELECT MAX(total) FROM daily)::bigint                                AS best_day,
             (SELECT COUNT(*) FROM daily)::bigint                                  AS active,
             (SELECT COUNT(*) FROM daily
                WHERE EXTRACT(DOW FROM d) IN (0, 6))::bigint                       AS weekend,
             (SELECT COALESCE(EXTRACT(DAY FROM MAX(gap)), 0) FROM gaps)::int       AS max_gap
    `,
  ]);

  const t = totals[0];
  const d = days[0];
  return {
    totalTokens: Number(t?.total ?? 0),
    calls: Number(t?.calls ?? 0),
    distinctSources: t?.sources ?? 0,
    distinctModels: t?.models ?? 0,
    nightCalls: Number(t?.night ?? 0),
    earlyCalls: Number(t?.early ?? 0),
    cacheReadTokens: Number(t?.cache ?? 0),
    bestWeekTokens: Number(best[0]?.best ?? 0),
    bestDayTokens: Number(d?.best_day ?? 0),
    activeDays: Number(d?.active ?? 0),
    weekendDays: Number(d?.weekend ?? 0),
    maxGapDays: Number(d?.max_gap ?? 0),
    maxProvidersInAWeek: weeks[0]?.max_providers ?? 0,
    longestStreak: Math.max(user?.longestStreak ?? 0, user?.currentStreak ?? 0),
    challengeWins: wins,
  };
}

/**
 * Recompute and persist a user's achievements.
 * Returns only the ones unlocked by *this* call, so the caller can notify.
 * Never throws — an achievement failure must not break ingest.
 */
export async function evaluateAchievements(userId: string): Promise<Achievement[]> {
  try {
    const [facts, existing] = await Promise.all([
      gatherFacts(userId),
      prisma.achievement.findMany({ where: { userId }, select: { key: true } }),
    ]);
    const have = new Set(existing.map((e) => e.key));

    const newly = ACHIEVEMENTS.filter((a) => !have.has(a.key) && EARNED[a.key]?.(facts));
    if (newly.length === 0) return [];

    await prisma.achievement.createMany({
      data: newly.map((a) => ({ userId, key: a.key })),
      skipDuplicates: true,
    });
    return newly;
  } catch {
    return [];
  }
}

/**
 * Evaluate and announce. Every path that can unlock an achievement should use
 * this rather than `evaluateAchievements` directly, so an unlock is never
 * silent — winning a challenge announces the same way syncing does.
 */
export async function evaluateAndNotify(userId: string): Promise<Achievement[]> {
  const unlocked = await evaluateAchievements(userId);
  for (const a of unlocked) {
    await notifyUser({
      userId,
      type: "achievement",
      message: `Achievement unlocked — ${a.icon} ${a.name}`,
      meta: { key: a.key, icon: a.icon, tier: a.tier },
      link: "/settings",
    });
  }
  return unlocked;
}

export type UnlockedAchievement = Achievement & { unlockedAt: string };

/**
 * A user's unlocked achievements, newest first.
 *
 * Re-evaluates before reading so the list is self-healing: a user whose burn
 * was backfilled, or who predates an achievement being added to the catalog,
 * gets it on their next profile view rather than waiting for a fresh sync.
 * `evaluateAchievements` is idempotent and swallows its own errors.
 */
export async function getAchievements(userId: string): Promise<UnlockedAchievement[]> {
  await evaluateAchievements(userId);
  const rows = await prisma.achievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });
  return rows.flatMap((r) => {
    const meta = ACHIEVEMENT_BY_KEY.get(r.key);
    return meta ? [{ ...meta, unlockedAt: r.unlockedAt.toISOString() }] : [];
  });
}

import { prisma } from "./db";
import { getRank, RANKS } from "./ranks";
import { formatTokens } from "./format";

/**
 * Fire-and-forget notification helpers. Called after ingest inserts new
 * burn events so we can check for milestones, rank-ups, overtakes, and
 * streak achievements.
 *
 * All functions are intentionally non-throwing — a notification failure
 * should never break the ingest pipeline.
 */

type Notify = {
  userId: string;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
  link?: string;
};

async function emit(n: Notify): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        message: n.message,
        meta: n.meta ? JSON.stringify(n.meta) : null,
        link: n.link ?? null,
      },
    });
  } catch {
    // Swallow — never break ingest for a notification
  }
}

// Dedupe guard: don't send the same notification type+key within a window.
// This prevents spamming "you overtook X" on every sync batch.
async function recentlyNotified(
  userId: string,
  type: string,
  keySubstring: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      message: { contains: keySubstring },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Check if user crossed a rank boundary with this sync.
 * @param userId    The user who just synced
 * @param oldTotal  Token total before this ingest batch
 * @param newTotal  Token total after this ingest batch
 */
export async function checkRankUp(
  userId: string,
  oldTotal: number,
  newTotal: number,
): Promise<void> {
  const oldRank = getRank(oldTotal);
  const newRank = getRank(newTotal);
  if (oldRank.name === newRank.name) return;

  // Only notify on actual promotions (not edge-case demotions)
  const oldIdx = RANKS.findIndex((r) => r.name === oldRank.name);
  const newIdx = RANKS.findIndex((r) => r.name === newRank.name);
  if (newIdx <= oldIdx) return;

  if (await recentlyNotified(userId, "rank_up", newRank.name)) return;

  await emit({
    userId,
    type: "rank_up",
    message: `You ranked up to ${newRank.icon} ${newRank.name}!`,
    meta: { rank: newRank.name, icon: newRank.icon, color: newRank.color },
  });
}

/**
 * Check if this user overtook someone on the leaderboard.
 * We only notify for the single most-notable overtake (the person
 * directly above them before this sync).
 */
export async function checkOvertake(
  userId: string,
  username: string,
  newTotal: number,
): Promise<void> {
  // Find users whose total is just below the new total — meaning we
  // just passed them. We use a raw aggregate to avoid loading all events.
  const overtaken = await prisma.$queryRaw<
    { id: string; username: string | null; total: bigint }[]
  >`
    SELECT u.id, u.username,
           COALESCE(SUM(b."totalTokens"), 0) AS total
    FROM "User" u
    LEFT JOIN "BurnEvent" b ON b."userId" = u.id
    WHERE u.id != ${userId}
      AND u.username IS NOT NULL
    GROUP BY u.id
    HAVING COALESCE(SUM(b."totalTokens"), 0) > 0
       AND COALESCE(SUM(b."totalTokens"), 0) < ${newTotal}
    ORDER BY total DESC
    LIMIT 1
  `;

  if (overtaken.length === 0) return;
  const victim = overtaken[0];
  if (!victim.username) return;

  if (await recentlyNotified(userId, "overtake", victim.username)) return;

  await emit({
    userId,
    type: "overtake",
    message: `You passed @${victim.username} on the leaderboard!`,
    meta: { overtaken: victim.username },
    link: `/h2h/${username}-vs-${victim.username}`,
  });

  // Also notify the overtaken user
  if (await recentlyNotified(victim.id, "overtake", username)) return;

  await emit({
    userId: victim.id,
    type: "overtake",
    message: `@${username} just passed you on the leaderboard!`,
    meta: { by: username },
    link: `/h2h/${victim.username}-vs-${username}`,
  });
}

/** Token milestones: 100K, 500K, 1M, 5M, 10M, 50M, 100M, 500M, 1B */
const MILESTONES = [
  100_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
  50_000_000, 100_000_000, 500_000_000, 1_000_000_000,
];

export async function checkMilestone(
  userId: string,
  oldTotal: number,
  newTotal: number,
): Promise<void> {
  for (const m of MILESTONES) {
    if (oldTotal < m && newTotal >= m) {
      const label = formatTokens(m);
      if (await recentlyNotified(userId, "milestone", label)) continue;
      await emit({
        userId,
        type: "milestone",
        message: `You hit ${label} total tokens burned!`,
        meta: { milestone: m, label },
      });
      return; // Only notify the highest crossed milestone
    }
  }
}

/** Streak milestones: 3d, 7d, 14d, 30d, 60d, 100d, 365d */
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

export async function checkStreakMilestone(
  userId: string,
  oldStreak: number,
  newStreak: number,
): Promise<void> {
  for (const s of STREAK_MILESTONES) {
    if (oldStreak < s && newStreak >= s) {
      const label = `${s}d`;
      if (await recentlyNotified(userId, "streak", label)) continue;
      await emit({
        userId,
        type: "streak",
        message: `${s}-day burn streak! Keep it going!`,
        meta: { days: s },
      });
      return;
    }
  }
}

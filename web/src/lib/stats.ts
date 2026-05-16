import { prisma } from "./db";

const hasDatabase = Boolean(process.env.DATABASE_URL);

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
  if (!hasDatabase) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const events = await prisma.burnEvent.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
  });

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
    lastActive: events.length > 0 ? events[0].timestamp.toISOString() : null,
  };
}

export async function getLeaderboard(): Promise<UserStats[]> {
  if (!hasDatabase) return [];

  const users = await prisma.user.findMany({ where: { username: { not: null } } });
  const stats = await Promise.all(users.map((u) => getUserStats(u.id)));
  return stats
    .filter((s): s is UserStats => s !== null)
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

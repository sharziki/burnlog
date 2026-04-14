import { prisma } from "./db";

export type UserStats = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  bio: string | null;
  totalTokens: number;
  weeklyTokens: number;
  streak: number;
  providers: { anthropic: number; openai: number; google: number };
  weeklyHistory: number[];
  topProjects: string[];
  tokensPerCommit: number;
  commits: number;
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

  // Provider split by share of tokens.
  const providerTotals = { anthropic: 0, openai: 0, google: 0 };
  for (const e of events) {
    const p = e.provider as keyof typeof providerTotals;
    if (p in providerTotals) providerTotals[p] += e.totalTokens;
  }
  const providerSum = providerTotals.anthropic + providerTotals.openai + providerTotals.google;
  const providers = providerSum
    ? {
        anthropic: providerTotals.anthropic / providerSum,
        openai: providerTotals.openai / providerSum,
        google: providerTotals.google / providerSum,
      }
    : { anthropic: 1, openai: 0, google: 0 };

  // Weekly history: 7 buckets ending today.
  const weeklyHistory: number[] = Array(7).fill(0);
  for (const e of events) {
    const diff = now - e.timestamp.getTime();
    if (diff >= WEEK) continue;
    const bucket = 6 - Math.floor(diff / DAY);
    if (bucket >= 0 && bucket < 7) weeklyHistory[bucket] += e.totalTokens;
  }

  // Streak: consecutive days ending today with at least one event.
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

  // Top projects by tokens.
  const byProject = new Map<string, number>();
  for (const e of events) {
    const label = e.project.split("/").filter(Boolean).pop() ?? e.project;
    byProject.set(label, (byProject.get(label) ?? 0) + e.totalTokens);
  }
  const topProjects = [...byProject.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  // "Commits" here = requests (unique requestIds).
  const commits = events.length;
  const tokensPerCommit = commits ? Math.round(total / commits) : 0;

  return {
    id: user.id,
    username: user.username ?? user.id,
    name: user.name ?? user.username ?? "anon",
    avatar: initials(user.name ?? user.username ?? "A"),
    bio: user.bio,
    totalTokens: total,
    weeklyTokens: weekly,
    streak,
    providers,
    weeklyHistory,
    topProjects: topProjects.length ? topProjects : ["—"],
    tokensPerCommit,
    commits,
  };
}

export async function getLeaderboard(): Promise<UserStats[]> {
  const users = await prisma.user.findMany({ where: { username: { not: null } } });
  const stats = await Promise.all(users.map((u) => getUserStats(u.id)));
  return stats
    .filter((s): s is UserStats => s !== null)
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

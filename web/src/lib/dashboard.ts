import { RANKS, getRank } from "./ranks";
import type { UserStats } from "./stats";

export type BenchmarkMetrics = {
  totalBurned: number;
  activeBurners: number;
  medianWeekly: number;
  streakLeader: { username: string; streak: number } | null;
  topWeeklyBurner: { username: string; weeklyTokens: number } | null;
};

export type ChallengeCard = {
  id: string;
  name: string;
  summary: string;
  metricLabel: string;
  leader: { username: string; value: string } | null;
  runnerUp: { username: string; value: string } | null;
  status: "live" | "warming-up";
};

export type ConnectorCard = {
  id: string;
  label: string;
  provider: string;
  logPath: string;
  command: string;
  connected: boolean;
  detail: string;
};

export type DashboardSnapshot = {
  users: UserStats[];
  currentUser: UserStats | null;
  metrics: BenchmarkMetrics;
  totalUsers: number;
  percentile: number | null;
  nextRank: { name: string; gap: number } | null;
  providerMix: { label: string; value: number }[];
  challenges: ChallengeCard[];
  connectors: ConnectorCard[];
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

function buildChallenges(users: UserStats[]): ChallengeCard[] {
  if (users.length < 2) {
    return [
      {
        id: "weekly-race",
        name: "Weekly burn race",
        summary: "Need at least two connected builders before live standings make sense.",
        metricLabel: "weekly burn",
        leader: users[0] ? { username: users[0].username, value: formatCompact(users[0].weeklyTokens) } : null,
        runnerUp: null,
        status: "warming-up",
      },
      {
        id: "streak-builder",
        name: "Streak builder",
        summary: "Once more burners join, this becomes the consistency ladder for consecutive active days.",
        metricLabel: "streak",
        leader: users[0] ? { username: users[0].username, value: `${users[0].streak}d` } : null,
        runnerUp: null,
        status: "warming-up",
      },
      {
        id: "multi-tool",
        name: "Multi-tool operator",
        summary: "Tracks who actually uses multiple coding-agent sources instead of camping on a single tool.",
        metricLabel: "connected sources",
        leader: users[0] ? { username: users[0].username, value: `${users[0].sources.length}` } : null,
        runnerUp: null,
        status: "warming-up",
      },
    ];
  }

  const byWeekly = [...users].sort((a, b) => b.weeklyTokens - a.weeklyTokens);
  const byStreak = [...users].sort((a, b) => b.streak - a.streak);
  const bySources = [...users].sort((a, b) => b.sources.length - a.sources.length || b.totalTokens - a.totalTokens);

  return [
    {
      id: "weekly-race",
      name: "Weekly burn race",
      summary: "Live sprint based on the last seven days of token burn. Fastest moving operator leads.",
      metricLabel: "weekly burn",
      leader: { username: byWeekly[0].username, value: formatCompact(byWeekly[0].weeklyTokens) },
      runnerUp: byWeekly[1] ? { username: byWeekly[1].username, value: formatCompact(byWeekly[1].weeklyTokens) } : null,
      status: "live",
    },
    {
      id: "streak-builder",
      name: "Streak builder",
      summary: "Consistency challenge for consecutive active days. Shows who keeps showing up, not just spiking once.",
      metricLabel: "streak",
      leader: { username: byStreak[0].username, value: `${byStreak[0].streak}d` },
      runnerUp: byStreak[1] ? { username: byStreak[1].username, value: `${byStreak[1].streak}d` } : null,
      status: "live",
    },
    {
      id: "multi-tool",
      name: "Multi-tool operator",
      summary: "Ranks builders by how many supported coding-agent sources they actually pipe into Burnlog.",
      metricLabel: "connected sources",
      leader: { username: bySources[0].username, value: `${bySources[0].sources.length}` },
      runnerUp: bySources[1] ? { username: bySources[1].username, value: `${bySources[1].sources.length}` } : null,
      status: "live",
    },
  ];
}

export function buildDashboardSnapshot(users: UserStats[], currentUsername: string | null): DashboardSnapshot {
  const sorted = [...users].sort((a, b) => b.totalTokens - a.totalTokens);
  const currentUser = sorted.find((user) => user.username === currentUsername) ?? null;
  const totalBurned = sorted.reduce((sum, user) => sum + user.totalTokens, 0);
  const activeBurners = sorted.filter((user) => user.weeklyTokens > 0).length;
  const medianWeekly = median(sorted.map((user) => user.weeklyTokens));
  const streakLeader = [...sorted].sort((a, b) => b.streak - a.streak)[0] ?? null;
  const topWeeklyBurner = [...sorted].sort((a, b) => b.weeklyTokens - a.weeklyTokens)[0] ?? null;

  const providerTotals = sorted.reduce(
    (acc, user) => {
      acc.anthropic += user.providers.anthropic * user.totalTokens;
      acc.openai += user.providers.openai * user.totalTokens;
      acc.google += user.providers.google * user.totalTokens;
      acc.other += user.providers.other * user.totalTokens;
      return acc;
    },
    { anthropic: 0, openai: 0, google: 0, other: 0 },
  );
  const providerSum = providerTotals.anthropic + providerTotals.openai + providerTotals.google + providerTotals.other;
  const providerMix = [
    { label: "Anthropic", value: providerSum ? providerTotals.anthropic / providerSum : 0 },
    { label: "OpenAI", value: providerSum ? providerTotals.openai / providerSum : 0 },
    { label: "Google", value: providerSum ? providerTotals.google / providerSum : 0 },
    { label: "Other", value: providerSum ? providerTotals.other / providerSum : 0 },
  ];

  const percentile = currentUser
    ? Math.round(((sorted.length - sorted.findIndex((user) => user.id === currentUser.id)) / sorted.length) * 100)
    : null;

  const nextRank = currentUser
    ? (() => {
        const upcoming = RANKS.find((rank) => rank.min > currentUser.totalTokens);
        return upcoming ? { name: upcoming.name, gap: upcoming.min - currentUser.totalTokens } : null;
      })()
    : null;

  const connectedSourceIds = new Set(currentUser?.sources.map((source) => source.source) ?? []);
  const connectors: ConnectorCard[] = [
    {
      id: "claude-code",
      label: "Claude Code",
      provider: "Anthropic",
      logPath: "~/.claude/projects/*/*.jsonl",
      command: "burnlog sync",
      connected: connectedSourceIds.has("claude-code"),
      detail: "Parses assistant usage blocks and dedupes by requestId.",
    },
    {
      id: "codex",
      label: "Codex CLI",
      provider: "OpenAI",
      logPath: "~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl",
      command: "burnlog sync",
      connected: connectedSourceIds.has("codex"),
      detail: "Reads session token totals from Codex rollout logs.",
    },
    {
      id: "hermes",
      label: "Hermes",
      provider: "Multi-provider",
      logPath: "Hermes local session logs",
      command: "burnlog sync",
      connected: connectedSourceIds.has("hermes"),
      detail: "Designed for agent-runtime usage once Hermes logs are present locally.",
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      provider: "Multi-provider",
      logPath: "OpenClaw local session logs",
      command: "burnlog sync",
      connected: connectedSourceIds.has("openclaw"),
      detail: "Lets you benchmark alternative open coding-agent stacks in one board.",
    },
  ];

  return {
    users: sorted,
    currentUser,
    metrics: {
      totalBurned,
      activeBurners,
      medianWeekly,
      streakLeader: streakLeader ? { username: streakLeader.username, streak: streakLeader.streak } : null,
      topWeeklyBurner: topWeeklyBurner
        ? { username: topWeeklyBurner.username, weeklyTokens: topWeeklyBurner.weeklyTokens }
        : null,
    },
    totalUsers: sorted.length,
    percentile,
    nextRank,
    providerMix,
    challenges: buildChallenges(sorted),
    connectors,
  };
}

export function getRankProgress(tokens: number): { current: string; next: string | null; ratio: number } {
  const currentRank = getRank(tokens);
  const nextRank = RANKS.find((rank) => rank.min > tokens) ?? null;
  if (!nextRank) return { current: currentRank.name, next: null, ratio: 1 };
  const span = nextRank.min - currentRank.min;
  const progress = span > 0 ? (tokens - currentRank.min) / span : 0;
  return { current: currentRank.name, next: nextRank.name, ratio: Math.min(1, Math.max(0, progress)) };
}

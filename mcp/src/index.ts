#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE = "https://burnlog.sxna.dev";

const apiKey = process.env.BURNLOG_API_KEY;
const baseUrl = (process.env.BURNLOG_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");

if (!apiKey) {
  process.stderr.write(
    "[burnlog-mcp] BURNLOG_API_KEY is not set.\n" +
      "  Grab a key at " + baseUrl + "/settings and add it to your MCP host config.\n",
  );
  process.exit(1);
}

async function apiGet<T>(path: string, auth = true): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (auth) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(baseUrl + path, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`burnlog api ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as T;
}

function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

type RankResponse = {
  ok: boolean;
  username: string | null;
  rank: string;
  rankIcon: string;
  totalTokens: number;
  position: number;
  totalUsers: number;
};

type StatsResponse = {
  ok: boolean;
  user: { username: string; name: string; bio: string | null };
  rank: { name: string; icon: string; min: number; max: number };
  totals: {
    allTime: number;
    weekly: number;
    events: number;
    tokensPerCommit: number;
    streakDays: number;
  };
  providers: { anthropic: number; openai: number; google: number; other: number };
  sources: { source: string; tokens: number }[];
  topModels: { model: string; tokens: number }[];
  weeklyHistory: number[];
};

type LeaderboardEntry = {
  username: string;
  name: string;
  avatar: string;
  totalTokens: number;
  weeklyTokens: number;
  streak: number;
};

type LeaderboardResponse = { users: LeaderboardEntry[] };

const server = new McpServer(
  { name: "burnlog", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "burnlog — query your AI token burn and rank. Tools:\n" +
      "  get_my_rank, get_my_stats, get_leaderboard, find_user.\n" +
      "Use these when the user asks about their token usage, rank, streak, or how they compare to others on the leaderboard.",
  },
);

server.registerTool(
  "get_my_rank",
  {
    description:
      "Get the current user's burnlog rank, position, and total tokens burned. Use this when the user asks 'what is my rank', 'where am I on the leaderboard', or similar.",
    inputSchema: {},
  },
  async () => {
    const data = await apiGet<RankResponse>("/api/me/rank");
    const lines = [
      `${data.rankIcon} ${data.rank} — ${formatTokens(data.totalTokens)} tokens`,
      `position: #${data.position} of ${data.totalUsers}`,
      data.username ? `user: @${data.username}` : "",
    ].filter(Boolean);
    return textResult(lines.join("\n"));
  },
);

server.registerTool(
  "get_my_stats",
  {
    description:
      "Get detailed burn stats for the current user: totals, weekly, streak, provider split, top models, per-source breakdown. Use when the user asks for details, a summary, or trend info.",
    inputSchema: {},
  },
  async () => {
    const s = await apiGet<StatsResponse>("/api/me/stats");
    const lines: string[] = [];
    lines.push(`@${s.user.username} (${s.user.name}) — ${s.rank.icon} ${s.rank.name}`);
    if (s.user.bio) lines.push(`bio: ${s.user.bio}`);
    lines.push("");
    lines.push(`all-time:     ${formatTokens(s.totals.allTime)}`);
    lines.push(`last 7 days:  ${formatTokens(s.totals.weekly)}`);
    lines.push(`events:       ${s.totals.events}`);
    lines.push(`tokens/event: ${formatTokens(s.totals.tokensPerCommit)}`);
    lines.push(`streak:       ${s.totals.streakDays} day${s.totals.streakDays === 1 ? "" : "s"}`);
    lines.push("");
    lines.push("providers:");
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    lines.push(`  anthropic  ${pct(s.providers.anthropic)}`);
    lines.push(`  openai     ${pct(s.providers.openai)}`);
    lines.push(`  google     ${pct(s.providers.google)}`);
    lines.push(`  other      ${pct(s.providers.other)}`);
    if (s.sources.length) {
      lines.push("");
      lines.push("sources:");
      for (const row of s.sources) {
        lines.push(`  ${row.source.padEnd(14)} ${formatTokens(row.tokens)}`);
      }
    }
    if (s.topModels.length) {
      lines.push("");
      lines.push("top models:");
      for (const row of s.topModels) {
        lines.push(`  ${row.model.padEnd(32)} ${formatTokens(row.tokens)}`);
      }
    }
    return textResult(lines.join("\n"));
  },
);

server.registerTool(
  "get_leaderboard",
  {
    description:
      "Get the public burnlog leaderboard — top users ranked by all-time tokens burned. Use when the user asks who's top, who's on the leaderboard, or wants to see overall rankings.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max users to return (default 10, max 50)."),
    },
  },
  async (args) => {
    const limit = args.limit ?? 10;
    const data = await apiGet<LeaderboardResponse>("/api/leaderboard", false);
    const top = data.users.slice(0, limit);
    if (top.length === 0) return textResult("leaderboard is empty");
    const lines = top.map((u, i) => {
      const pos = String(i + 1).padStart(2);
      return `${pos}. @${u.username.padEnd(20)} ${formatTokens(u.totalTokens).padStart(8)}  (week ${formatTokens(u.weeklyTokens)}, streak ${u.streak}d)`;
    });
    return textResult(lines.join("\n"));
  },
);

server.registerTool(
  "find_user",
  {
    description:
      "Look up a specific user on the burnlog leaderboard by GitHub username. Returns their rank, total tokens, weekly tokens, and streak.",
    inputSchema: {
      username: z
        .string()
        .min(1)
        .max(64)
        .describe("GitHub username (case-insensitive)."),
    },
  },
  async (args) => {
    const data = await apiGet<LeaderboardResponse>("/api/leaderboard", false);
    const target = args.username.toLowerCase();
    const idx = data.users.findIndex((u) => u.username.toLowerCase() === target);
    if (idx === -1) return textResult(`no user @${args.username} on the leaderboard`);
    const u = data.users[idx]!;
    const lines = [
      `@${u.username} (${u.name})`,
      `position: #${idx + 1} of ${data.users.length}`,
      `all-time: ${formatTokens(u.totalTokens)}`,
      `weekly:   ${formatTokens(u.weeklyTokens)}`,
      `streak:   ${u.streak} day${u.streak === 1 ? "" : "s"}`,
    ];
    return textResult(lines.join("\n"));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_BASE = "https://burnlog.net";

// Zero-config auth: prefer env vars (CI / explicit host config), then fall back
// to the credentials the `burnlog` CLI writes after `burnlog login` (GitHub
// sign-in). This is why `npx @sxnalabs/burnlog-mcp` "just works" once you've logged
// in once — no key to copy-paste.
function loadCliConfig(): { apiKey?: string; apiUrl?: string } {
  try {
    const raw = readFileSync(join(homedir(), ".burnlog", "config.json"), "utf8");
    const parsed = JSON.parse(raw) as { apiKey?: string; apiUrl?: string };
    return { apiKey: parsed.apiKey, apiUrl: parsed.apiUrl };
  } catch {
    return {};
  }
}

const cliConfig = loadCliConfig();
const apiKey = process.env.BURNLOG_API_KEY ?? cliConfig.apiKey;
const baseUrl = (process.env.BURNLOG_API_URL ?? cliConfig.apiUrl ?? DEFAULT_BASE).replace(/\/$/, "");

if (!apiKey) {
  process.stderr.write(
    "[burnlog-mcp] Not connected.\n" +
      "  Run `burnlog login` (or `npx @sxnalabs/burnlog login`) to sign in with GitHub — then this\n" +
      "  server picks up your credentials automatically. Or set BURNLOG_API_KEY (grab a key at " +
      baseUrl + "/settings).\n",
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

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the API's structured message when present (e.g. bad_invite).
    let msg = `burnlog api ${res.status}: ${text.slice(0, 200)}`;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      if (parsed.message ?? parsed.error) msg = (parsed.message ?? parsed.error)!;
    } catch {
      // non-JSON body — keep the raw message
    }
    throw new Error(msg);
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

type ClubBudget = {
  name: string;
  slug: string;
  isPrivate: boolean;
  isOwner: boolean;
  memberCount: number;
  totalTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
  serviceTokens?: number;
  monthlyBudgetTokens: number;
  monthlyBudgetUsedPct: number;
  budgetStatus: "unset" | "ok" | "warning" | "over";
  members: {
    username: string | null;
    name: string | null;
    totalTokens: number;
    weeklyTokens: number;
    monthlyTokens: number;
  }[];
};

type ClubsResponse = { ok: boolean; username: string | null; clubs: ClubBudget[] };

const server = new McpServer(
  { name: "burnlog", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "burnlog — query your AI token burn and rank, join orgs, and run challenges. Tools:\n" +
      "  get_my_rank, get_my_stats, get_my_clubs, get_leaderboard, find_user, list_orgs, join_org,\n" +
      "  get_my_challenges, create_challenge, join_challenge,\n" +
      "  get_my_history, find_people, get_club_feed, post_to_club.\n" +
      "Use the read tools when the user asks about token usage, rank, team budgets, streak, or leaderboard comparisons.\n" +
      "Use list_orgs to discover joinable orgs (teams/clubs) and join_org to join one (by slug; private orgs need an inviteCode).\n" +
      "Use create_challenge when the user wants to compete with someone — it returns a shareable invite link.\n" +
      "Use get_my_history for 'how much have I burned in 6 months', cost, or environmental-impact questions.\n" +
      "Use get_club_feed/post_to_club to read or join the discussion about MCP servers, skills, and agent setups.",
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
  "get_my_clubs",
  {
    description:
      "Get team/club budget health for the current API key: joined teams, monthly budget usage, warning/over status, and member token totals. Use when the user asks about team spend, budget risk, or which team is over budget.",
    inputSchema: {
      includeMembers: z
        .boolean()
        .optional()
        .describe("Include per-member token totals (default true)."),
    },
  },
  async (args) => {
    const data = await apiGet<ClubsResponse>("/api/me/clubs");
    if (data.clubs.length === 0) return textResult("no teams joined");

    const includeMembers = args.includeMembers ?? true;
    const statusIcon: Record<ClubBudget["budgetStatus"], string> = {
      unset: "-",
      ok: "ok",
      warning: "warn",
      over: "over",
    };

    const lines: string[] = [];
    lines.push(`teams for ${data.username ? `@${data.username}` : "current key"}:`);
    for (const club of data.clubs) {
      const budget = club.monthlyBudgetTokens > 0
        ? `${club.monthlyBudgetUsedPct}% of ${formatTokens(club.monthlyBudgetTokens)}`
        : "no budget";
      lines.push("");
      lines.push(
        `${statusIcon[club.budgetStatus]} ${club.name}${club.isPrivate ? " (private)" : ""} — ${budget}`,
      );
      lines.push(
        `  MTD ${formatTokens(club.monthlyTokens)} · week ${formatTokens(club.weeklyTokens)} · all-time ${formatTokens(club.totalTokens)} · ${club.memberCount} members`,
      );
      if (club.serviceTokens && club.serviceTokens > 0) {
        lines.push(`  shared service usage: ${formatTokens(club.serviceTokens)}`);
      }
      if (includeMembers && club.members.length) {
        for (const m of club.members.slice(0, 8)) {
          const who = m.username ? `@${m.username}` : (m.name ?? "unknown");
          lines.push(`  - ${who.padEnd(18)} MTD ${formatTokens(m.monthlyTokens).padStart(8)} all ${formatTokens(m.totalTokens).padStart(8)}`);
        }
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

type OrgEntry = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
};

type OrgsResponse = { ok: boolean; username: string | null; orgs: OrgEntry[] };

type JoinResponse = {
  ok: boolean;
  joined?: boolean;
  alreadyMember?: boolean;
  org?: { id: string; name: string; slug: string };
  error?: string;
  message?: string;
};

server.registerTool(
  "list_orgs",
  {
    description:
      "List burnlog orgs (teams/clubs) the current user can see or join: all public orgs plus any they already belong to. Use when the user asks what teams/orgs exist, which they can join, or which they're already in. Returns slug (use it with join_org), member count, and whether they're already a member.",
    inputSchema: {
      onlyJoinable: z
        .boolean()
        .optional()
        .describe("If true, hide orgs the user is already a member of (default false)."),
    },
  },
  async (args) => {
    const data = await apiGet<OrgsResponse>("/api/orgs");
    let orgs = data.orgs;
    if (args.onlyJoinable) orgs = orgs.filter((o) => !o.isMember);
    if (orgs.length === 0) return textResult("no orgs found");
    const lines = orgs.map((o) => {
      const tags = [
        o.isMember ? "member" : "joinable",
        o.isPrivate ? "private" : "public",
        o.isOwner ? "owner" : "",
      ].filter(Boolean);
      const desc = o.description ? ` — ${o.description}` : "";
      return `${o.slug.padEnd(20)} ${String(o.memberCount).padStart(4)} members  [${tags.join(", ")}]  ${o.name}${desc}`;
    });
    return textResult(lines.join("\n"));
  },
);

server.registerTool(
  "join_org",
  {
    description:
      "Join a burnlog org (team/club) on the user's behalf. Pass the org's slug (from list_orgs). Private orgs require an inviteCode. Use when the user says 'join <org>' or wants to be added to a team.",
    inputSchema: {
      slug: z.string().min(1).max(80).describe("The org slug to join (from list_orgs)."),
      inviteCode: z
        .string()
        .max(128)
        .optional()
        .describe("Invite code — required only for private orgs."),
    },
  },
  async (args) => {
    const data = await apiPost<JoinResponse>("/api/orgs/join", {
      slug: args.slug,
      inviteCode: args.inviteCode,
    });
    const org = data.org;
    const name = org ? `${org.name} (${org.slug})` : args.slug;
    if (data.alreadyMember) return textResult(`already a member of ${name}`);
    return textResult(`joined ${name}`);
  },
);

// ---------- Challenges ----------

type ChallengeStanding = {
  userId: string;
  username: string;
  score: number;
  tokens: number;
  qualified: boolean;
  note: string | null;
  place: number;
};

type ChallengeEntry = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  unit: string;
  inviteCode: string;
  hostUsername: string;
  status: "upcoming" | "active" | "ended";
  msRemaining: number;
  standings: ChallengeStanding[];
  winnerUsername: string | null;
};

type ChallengesResponse = {
  ok: boolean;
  mine: ChallengeEntry[];
  open: ChallengeEntry[];
};

type CreateChallengeResponse = {
  ok: boolean;
  challenge: { id: string; name: string; type: string; inviteCode: string; url: string };
};

function remaining(ms: number): string {
  if (ms <= 0) return "ended";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h left` : `${hours}h left`;
}

function renderChallenge(c: ChallengeEntry): string {
  const lines = [
    `${c.name} — ${c.typeLabel} · ${c.status === "ended" ? "settled" : remaining(c.msRemaining)}`,
    `  ${baseUrl}/c/${c.inviteCode}`,
  ];
  for (const s of c.standings.slice(0, 8)) {
    const marker = c.status === "ended" && s.username === c.winnerUsername ? "*" : `${s.place}.`;
    const score = s.qualified
      ? `${Math.round(s.score).toLocaleString()} ${c.unit}`
      : (s.note ?? "not qualified");
    lines.push(`  ${marker} @${s.username.padEnd(18)} ${score}  (${formatTokens(s.tokens)})`);
  }
  return lines.join("\n");
}

server.registerTool(
  "get_my_challenges",
  {
    description:
      "List the burnlog challenges the current user is in, with live standings, plus challenges open to join. Use when the user asks 'am I winning', 'how's my sprint going', or 'what challenges am I in'.",
    inputSchema: {},
  },
  async () => {
    const data = await apiGet<ChallengesResponse>("/api/challenges");
    const parts: string[] = [];
    if (data.mine.length) {
      parts.push("your challenges:");
      parts.push(data.mine.map(renderChallenge).join("\n\n"));
    } else {
      parts.push("you're not in any challenges — use create_challenge to start one");
    }
    if (data.open.length) {
      parts.push("");
      parts.push("open to join:");
      parts.push(
        data.open
          .slice(0, 5)
          .map((c) => `  ${c.name} (${c.typeLabel}) — ${baseUrl}/c/${c.inviteCode}`)
          .join("\n"),
      );
    }
    return textResult(parts.join("\n"));
  },
);

server.registerTool(
  "create_challenge",
  {
    description:
      "Start a burnlog challenge and get a shareable invite link. Use when the user wants to compete with someone on token burn.",
    inputSchema: {
      name: z.string().min(1).max(60).describe("Challenge name, e.g. 'Weekend Sprint'."),
      type: z
        .enum(["sprint", "efficiency", "provider", "streak", "cost-cap"])
        .default("sprint")
        .describe(
          "sprint = most tokens wins; efficiency = fewest tokens/call; provider = highest share on one provider; streak = first to a target streak; cost-cap = most calls under a token budget.",
        ),
      days: z
        .number()
        .int()
        .optional()
        .describe("Duration in days. Must be valid for the type (sprint: 3/7/14/30)."),
      provider: z
        .enum(["anthropic", "openai", "google", "other"])
        .optional()
        .describe("Target provider, for type=provider."),
      targetStreak: z.number().int().optional().describe("Target streak days, for type=streak."),
      budgetTokens: z.number().int().optional().describe("Token ceiling, for type=cost-cap."),
    },
  },
  async (args) => {
    const data = await apiPost<CreateChallengeResponse>("/api/challenges", args);
    return textResult(
      `created "${data.challenge.name}"\nshare: ${baseUrl}/c/${data.challenge.inviteCode}`,
    );
  },
);

server.registerTool(
  "join_challenge",
  {
    description: "Join a burnlog challenge using its invite code or a pasted invite URL.",
    inputSchema: {
      code: z.string().min(1).max(200).describe("Invite code, or the full /c/<code> URL."),
    },
  },
  async (args) => {
    const code = args.code.replace(/^.*\/c\//, "").replace(/[^a-z0-9]/gi, "");
    await apiPost<{ ok: boolean }>(`/api/challenges/${code}/join`, {});
    return textResult(`joined — ${baseUrl}/c/${code}`);
  },
);

// ---------- History & impact ----------

type HistoryResponse = {
  ok: boolean;
  days: number;
  totals: {
    tokens: number;
    calls: number;
    activeDays: number;
    dailyAverage: number;
    estimatedCostUsd: number;
  };
  impact: { kwh: number; gCo2e: number; litres: number };
  peak: { date: string; tokens: number } | null;
  monthly: { month: string; tokens: number }[];
  models: { model: string; tokens: number }[];
  sources: { source: string; tokens: number }[];
};

server.registerTool(
  "get_my_history",
  {
    description:
      "Long-range burn history for the current user: daily totals rolled up by month, top models, per-agent split, estimated API cost, and estimated environmental impact. Use for questions like 'how much have I burned in the last 6 months', 'which model do I use most', 'what has this cost me', or 'what's my carbon footprint'.",
    inputSchema: {
      days: z
        .number()
        .int()
        .min(1)
        .max(400)
        .optional()
        .describe("Window length in days. Defaults to 180."),
    },
  },
  async (args) => {
    const days = args.days ?? 180;
    const d = await apiGet<HistoryResponse>(`/api/me/history?days=${days}`);
    const lines: string[] = [];
    lines.push(`last ${d.days} days`);
    lines.push(
      `  ${formatTokens(d.totals.tokens)} tokens · ${d.totals.calls} calls · $${d.totals.estimatedCostUsd.toFixed(2)} est. API cost`,
    );
    lines.push(
      `  active ${d.totals.activeDays}/${d.days} days · avg ${formatTokens(d.totals.dailyAverage)}/active day`,
    );
    const co2 =
      d.impact.gCo2e >= 1000 ? `${(d.impact.gCo2e / 1000).toFixed(1)} kg` : `${Math.round(d.impact.gCo2e)} g`;
    lines.push(
      `  estimated impact: ${d.impact.kwh.toFixed(2)} kWh · ${co2} CO2e · ${d.impact.litres.toFixed(1)} L water (rough)`,
    );
    if (d.peak) lines.push(`  peak day: ${d.peak.date} (${formatTokens(d.peak.tokens)})`);
    if (d.monthly.length) {
      lines.push("", "by month:");
      for (const m of d.monthly) lines.push(`  ${m.month}  ${formatTokens(m.tokens)}`);
    }
    if (d.sources.length) {
      lines.push("", "by agent:");
      for (const s of d.sources) lines.push(`  ${s.source.padEnd(14)} ${formatTokens(s.tokens)}`);
    }
    if (d.models.length) {
      lines.push("", "top models:");
      for (const m of d.models.slice(0, 8)) lines.push(`  ${m.model.padEnd(28)} ${formatTokens(m.tokens)}`);
    }
    return textResult(lines.join("\n"));
  },
);

// ---------- People ----------

server.registerTool(
  "find_people",
  {
    description:
      "Search burnlog users by username or display name. Returns each match's total burn.",
    inputSchema: {
      query: z.string().min(2).max(64).describe("Name or username fragment."),
    },
  },
  async (args) => {
    const d = await apiGet<{
      ok: boolean;
      people: { username: string; name: string; totalTokens: number }[];
    }>(`/api/people?q=${encodeURIComponent(args.query)}`, false);
    if (!d.people.length) return textResult(`nobody matching "${args.query}"`);
    return textResult(
      d.people
        .map((p) => `@${p.username.padEnd(18)} ${formatTokens(p.totalTokens).padStart(8)}`)
        .join("\n"),
    );
  },
);

// ---------- Club feed ----------

type ClubPost = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  createdAt: string;
  author: { username: string | null };
  replies: { body: string; author: { username: string | null } }[];
};

server.registerTool(
  "get_club_feed",
  {
    description:
      "Read a burnlog club's discussion feed — where members post about MCP servers, skills, agent setups, and costs. Use when the user asks what their club is discussing, or wants to find setups other people are running.",
    inputSchema: {
      clubId: z.string().min(1).max(64).describe("Club id (from get_my_clubs or list_orgs)."),
      tag: z
        .string()
        .max(32)
        .optional()
        .describe("Filter to one topic tag, e.g. mcp, skills, agents, prompts."),
    },
  },
  async (args) => {
    const query = args.tag ? `?tag=${encodeURIComponent(args.tag)}` : "";
    const d = await apiGet<{ ok: boolean; posts: ClubPost[] }>(
      `/api/clubs/${args.clubId}/posts${query}`,
    );
    if (!d.posts.length) return textResult("no posts in that club yet");
    return textResult(
      d.posts
        .map((p) => {
          const head = `@${p.author.username}${p.tags.length ? ` [${p.tags.join(", ")}]` : ""}`;
          const title = p.title ? `\n  ${p.title}` : "";
          const replies = p.replies.length
            ? "\n" + p.replies.map((r) => `    ↳ @${r.author.username}: ${r.body}`).join("\n")
            : "";
          return `${head}${title}\n  ${p.body}${replies}`;
        })
        .join("\n\n"),
    );
  },
);

server.registerTool(
  "post_to_club",
  {
    description:
      "Post to a burnlog club feed, or reply to an existing post. Use to share an MCP setup, a skill, or a finding with the club. Requires membership.",
    inputSchema: {
      clubId: z.string().min(1).max(64).describe("Club id."),
      body: z.string().min(1).max(8000).describe("Post body."),
      title: z.string().max(120).optional().describe("Optional title."),
      tags: z
        .string()
        .max(120)
        .optional()
        .describe("Comma-separated topic tags, e.g. 'mcp,setup'."),
      postId: z
        .string()
        .max(64)
        .optional()
        .describe("Set to reply to an existing post instead of creating one."),
    },
  },
  async (args) => {
    const d = await apiPost<{ ok: boolean; postId?: string; replyId?: string }>(
      `/api/clubs/${args.clubId}/posts`,
      { body: args.body, title: args.title, tags: args.tags, postId: args.postId },
    );
    return textResult(d.replyId ? "reply posted" : `posted (${d.postId})`);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

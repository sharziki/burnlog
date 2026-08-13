/**
 * "burnlog vs <x>" pages.
 *
 * Rules these follow, because a comparison page that breaks them is worth less
 * than no page at all:
 *
 * 1. Every claim about another project comes from that project's own README or
 *    site, and is dated. Facts here were read on 2026-08-13.
 * 2. Each page says plainly when the other tool is the better choice. Two of
 *    these three genuinely are, for common cases — ccusage reads more agent
 *    formats than burnlog does, and that is stated rather than buried.
 * 3. No claim that a rival is slow, insecure, or badly built. The differences
 *    are real design choices, and they read as choices.
 *
 * If a rival ships something that closes a gap, edit the row. A stale
 * comparison is a lie with a timestamp on it.
 */
export type Comparison = {
  slug: string;
  /** Their name, spelled their way. */
  rival: string;
  title: string;
  description: string;
  /** The honest one-paragraph answer, before any table. */
  verdict: string[];
  /** What they are, in their own terms. */
  theirs: { what: string; license: string; source: string };
  rows: { label: string; burnlog: string; rival: string }[];
  /** The section that makes the page trustworthy. */
  useThemWhen: string[];
  useBurnlogWhen: string[];
};

const FACTS_READ = "2026-08-13";

export const COMPARISONS: Comparison[] = [
  {
    slug: "ccusage",
    rival: "ccusage",
    title: "burnlog vs ccusage",
    description:
      "ccusage analyses your AI coding token usage locally. burnlog puts it on a public leaderboard. An honest comparison, including when ccusage is the better tool.",
    verdict: [
      "These aren't really competitors, and pretending otherwise would waste your time. ccusage is a local analysis tool: it reads the usage logs your agents already wrote and tells you what you spent, by day, week, month, session, and model, without an account and without sending anything anywhere. burnlog is a leaderboard: it counts the same kind of usage and then ranks you against other people.",
      "If nothing about your usage needs to leave your machine, ccusage is the right answer and burnlog has nothing to add. Plenty of people run both — ccusage for the ledger, burnlog for the standings.",
    ],
    theirs: {
      what: "A CLI that analyses coding-agent token usage and cost from local data, with cache-aware token accounting and per-day, per-week, per-month and per-session breakdowns.",
      license: "MIT",
      source: "https://github.com/ryoppippi/ccusage",
    },
    rows: [
      {
        label: "What it is for",
        burnlog: "Ranking your usage against other people, publicly",
        rival: "Understanding your own usage and cost, locally",
      },
      {
        label: "Account required",
        burnlog: "GitHub sign-in to appear on the board; the scan works signed out",
        rival: "None, ever",
      },
      {
        label: "Data leaving your machine",
        burnlog: "Token counts, model, agent, an opaque id and a timestamp",
        rival: "Nothing",
      },
      {
        label: "Agents read from local logs",
        burnlog: "Claude Code, Codex, Hermes",
        rival: "16+ sources, including Copilot CLI, Goose, Kilo, Qwen and more",
      },
      {
        label: "Agents with no readable log",
        burnlog: "Counted at the wire by burnlog wrap, across 14 providers",
        rival: "Out of scope — it reads what is on disk",
      },
      {
        label: "Cost figures",
        burnlog: "Estimated server-side from tokens, per bucket",
        rival: "Calculated locally, with an offline pricing cache",
      },
      {
        label: "Leaderboard, ranks, badge",
        burnlog: "Public board, 11-rank ladder, achievements, README badge",
        rival: "None — sharing is a compact mode meant for screenshots",
      },
      { label: "Licence", burnlog: "MIT CLI, self-hostable app", rival: "MIT" },
    ],
    useThemWhen: [
      "You want your usage data to stay on your machine, full stop.",
      "You use an agent burnlog has no log adapter for and you don't want to run anything under a proxy — ccusage reads considerably more log formats than burnlog does.",
      "You want a precise local cost ledger, including Claude Code's 5-hour billing windows, rather than a rank.",
    ],
    useBurnlogWhen: [
      "The point is the competition — a public board, a rank, and a number your friends can see.",
      "Your tokens go through something with no readable log, or through a provider beyond the usual two: wrap counts at the wire, so a tool burnlog has never heard of still counts.",
      "You want a README badge that updates itself, or a profile to point at.",
    ],
  },
  {
    slug: "viberank",
    rival: "viberank",
    title: "burnlog vs viberank",
    description:
      "Both are public leaderboards for AI coding usage. The differences are what they measure, where the numbers come from, and what you have to upload to take part.",
    verdict: [
      "This is the real overlap: viberank is a community leaderboard for AI coding usage, ranked by cost and tokens, with a tiered ladder, GitHub-verified submissions, per-tool filtering and shareable rank cards. If you want a board to be on, it is a good one and it got there first.",
      "The differences worth knowing are three. viberank's submissions are built from ccusage output or an uploaded cc.json, so its coverage is whatever ccusage can read; burnlog also counts at the wire, which reaches agents that write no log at all. viberank ranks on cost as well as tokens, which means uploading what you spent; burnlog uploads token counts only and estimates cost server-side, so your spend stays your business. And burnlog's ladder runs eleven ranks to ten trillion tokens, because real usage blew through a ten-million ceiling long ago.",
    ],
    theirs: {
      what: "A community leaderboard for AI coding usage. Data is submitted with its own CLI, which reads local ccusage data, or by uploading a cc.json; GitHub sign-in verifies a submission.",
      license: "MIT",
      source: "https://github.com/sculptdotfun/viberank",
    },
    rows: [
      {
        label: "Ranked by",
        burnlog: "Tokens burned",
        rival: "Cost and tokens",
      },
      {
        label: "What you upload",
        burnlog: "Token counts, model, agent, opaque id, timestamp",
        rival: "Total API costs, token counts, and which tools contributed",
      },
      {
        label: "Where numbers come from",
        burnlog: "Own log adapters, plus the wrap proxy reading provider usage fields",
        rival: "ccusage output, or a cc.json you upload",
      },
      {
        label: "Agents with no readable log",
        burnlog: "Counted through wrap, across 14 providers",
        rival: "Limited to what ccusage can read",
      },
      {
        label: "Rank ladder",
        burnlog: "11 ranks, Spark to Boltzmann, topping out at 10T tokens",
        rival: "Tiered ladder, Spark through Supernova, based on spend",
      },
      {
        label: "Verification",
        burnlog: "GitHub sign-in; events deduped by an opaque per-request id",
        rival: "GitHub sign-in, with verified badges and server-side validation",
      },
      {
        label: "Self-hosting",
        burnlog: "Whole app runs against your own Postgres",
        rival: "Source is MIT-licensed",
      },
      {
        label: "Also has",
        burnlog: "Achievements, README badge, embeddable widget, MCP server",
        rival: "Per-tool leaderboards, rank cards, a hiring marketplace, a blog",
      },
    ],
    useThemWhen: [
      "Your usage is Claude Code through ccusage, and you'd rather be ranked on what you spent than on what you burned.",
      "You want the hiring marketplace and the per-tool boards it runs alongside the leaderboard.",
      "You're already there with history you don't want to leave behind.",
    ],
    useBurnlogWhen: [
      "You'd rather not upload what you spend. burnlog never receives a cost figure; it estimates one from tokens, per bucket, and cache reads are priced as cache reads.",
      "Your burn isn't only Claude Code: wrap counts Gemini CLI, aider, opencode, your own scripts, and anything else that reads a standard base-URL variable.",
      "You're past the top of a short ladder and want a rank that still means something at eleven figures.",
    ],
  },
  {
    slug: "ccgather",
    rival: "CCgather",
    title: "burnlog vs CCgather",
    description:
      "CCgather is a Claude Code leaderboard with heavy gamification. burnlog is agent-agnostic and ranks on tokens alone. Where each one fits.",
    verdict: [
      "CCgather is a Claude Code leaderboard with a lot of game in it: a global board across 40+ countries, ten progression levels, twenty-seven badges, a 3D globe, an activity heatmap, and a PWA with push notifications. If your AI coding is Claude Code and you want the most playful board, that is a fair reason to pick it.",
      "burnlog's bet is different. It is agent-agnostic before it is gamified: three log adapters plus a proxy that counts anything talking to fourteen providers, so Codex, Gemini CLI, aider and your own scripts land on the same board as Claude Code. It ranks on tokens rather than spend, and it never receives a cost figure at all.",
    ],
    theirs: {
      what: "A free, open-source Claude Code leaderboard. Usage syncs automatically after running its CLI, and the board shows tokens, sessions and cost.",
      license: "Apache 2.0",
      source: "https://ccgather.com/",
    },
    rows: [
      {
        label: "Agents covered",
        burnlog: "Claude Code, Codex, Hermes from logs; anything else through wrap",
        rival: "Claude Code",
      },
      { label: "Ranked by", burnlog: "Tokens burned", rival: "Tokens and cost" },
      {
        label: "What you upload",
        burnlog: "Token counts, model, agent, opaque id, timestamp",
        rival: "Token usage, session counts, and spend",
      },
      {
        label: "Progression",
        burnlog: "11 ranks to 10T tokens, 13 achievements recomputed from events",
        rival: "10 levels and 27 badges",
      },
      {
        label: "Extras",
        burnlog: "README badge, embeddable widget, MCP server, CSV reports",
        rival: "3D globe, activity heatmap, PWA with push, translated community posts",
      },
      { label: "Licence", burnlog: "MIT CLI, self-hostable app", rival: "Apache 2.0" },
    ],
    useThemWhen: [
      "You only use Claude Code and want the most gamified board of the three.",
      "You want a phone-installable PWA with push notifications.",
      "You like the globe. It is genuinely nice.",
    ],
    useBurnlogWhen: [
      "You run more than one agent and want them on one board instead of one board each.",
      "You'd rather your spend stayed off someone else's server.",
      "You want the numbers to keep counting for a tool nobody has written an adapter for yet — that is what the open JSONL sink is for.",
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}

export const COMPARISON_FACTS_READ = FACTS_READ;

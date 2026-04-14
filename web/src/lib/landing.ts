import type { UserStats } from "./stats";

export type Announcement = {
  id: string;
  date: string;
  title: string;
  summary: string;
  href: string;
  cta: string;
};

export type LandingMetric = {
  label: string;
  value: string;
  tone?: "accent" | "neutral";
};

export type CaseStudySnapshot = {
  label: string;
  title: string;
  summary: string;
  bullets: string[];
  metrics: LandingMetric[];
};

export type LandingSnapshot = {
  metrics: LandingMetric[];
  announcements: Announcement[];
  caseStudy: CaseStudySnapshot;
  featuredUsers: UserStats[];
};

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "landing-and-board",
    date: "Apr 14, 2026",
    title: "New landing page, cleaner board split",
    summary:
      "Burnlog now has a proper public-facing entry point and a dedicated /board surface instead of dumping every visitor straight into the operator shell.",
    href: "/board",
    cta: "Open live board",
  },
  {
    id: "real-data-only",
    date: "Apr 14, 2026",
    title: "No fake operators, no padded standings",
    summary:
      "The product now reads directly from real ingest history. Empty states stay honest until more builders actually connect their logs.",
    href: "/settings",
    cta: "Connect your setup",
  },
  {
    id: "privacy-model",
    date: "Apr 14, 2026",
    title: "Private-by-default ingest model stays intact",
    summary:
      "Burnlog tracks token totals, provider, model, timestamp, and source. It does not upload source code, prompts, repo names, or cwd metadata.",
    href: "/settings",
    cta: "See the ingest flow",
  },
];

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildLandingSnapshot(users: UserStats[]): LandingSnapshot {
  const featuredUsers = [...users].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 3);
  const totalTokens = users.reduce((sum, user) => sum + user.totalTokens, 0);
  const totalEvents = users.reduce((sum, user) => sum + user.commits, 0);
  const uniqueSources = new Set(users.flatMap((user) => user.sources.map((source) => source.source)));
  const caseStudyUser =
    users.find((user) => user.username.toLowerCase() === "sharziki") ?? featuredUsers[0] ?? null;

  const metrics: LandingMetric[] = [
    {
      label: "tracked operators",
      value: users.length.toString(),
      tone: users.length > 0 ? "accent" : "neutral",
    },
    {
      label: "verified burn events",
      value: formatCompact(totalEvents),
      tone: totalEvents > 0 ? "accent" : "neutral",
    },
    {
      label: "tokens ingested",
      value: formatCompact(totalTokens),
      tone: totalTokens > 0 ? "accent" : "neutral",
    },
    {
      label: "connected sources",
      value: uniqueSources.size.toString(),
      tone: uniqueSources.size > 0 ? "accent" : "neutral",
    },
  ];

  const caseStudy: CaseStudySnapshot = caseStudyUser
    ? {
        label: "First case study",
        title: `${caseStudyUser.name} is running Burnlog on real coding-agent history`,
        summary:
          "Burnlog is dogfooding on SXNA Labs usage first: one operator, real local logs, zero fake leaderboard padding. That gives the product a truthful baseline before broader invites roll out.",
        bullets: [
          `${pluralize(caseStudyUser.sources.length, "connected source", "connected sources")}: ${caseStudyUser.sources.map((source) => source.source).join(", ") || "none yet"}.`,
          `${formatCompact(caseStudyUser.totalTokens)} tokens ingested so far with ${pluralize(caseStudyUser.commits, "verified event", "verified events")}.`,
          caseStudyUser.topModels.length
            ? `Current model mix is led by ${caseStudyUser.topModels[0].model}.`
            : "Model history will appear automatically once usage lands in the ingest API.",
        ],
        metrics: [
          { label: "operator", value: `@${caseStudyUser.username}` },
          { label: "burn total", value: formatCompact(caseStudyUser.totalTokens) },
          { label: "weekly burn", value: formatCompact(caseStudyUser.weeklyTokens) },
          { label: "sources", value: caseStudyUser.sources.length.toString() },
        ],
      }
    : {
        label: "First case study",
        title: "Burnlog is ready for the first real operator profile",
        summary:
          "There is no padded sample company here. The first case study will appear as soon as a real builder connects their local logs and syncs them to the board.",
        bullets: [
          "Connect the CLI from Settings.",
          "Run burnlog sync from the machine that already has local agent logs.",
          "The case study section will update automatically from real ingest data.",
        ],
        metrics: [
          { label: "operators", value: "0" },
          { label: "burn total", value: "0" },
          { label: "weekly burn", value: "0" },
          { label: "sources", value: uniqueSources.size.toString() },
        ],
      };

  return {
    metrics,
    announcements: ANNOUNCEMENTS,
    caseStudy,
    featuredUsers,
  };
}

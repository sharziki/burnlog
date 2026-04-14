import type { ChallengeSummary, GroupSummary } from "./community";
import type { UserStats } from "./stats";

export type Announcement = {
  id: string;
  date: string;
  title: string;
  href: string;
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
  leaderboardUsers: UserStats[];
  featuredGroups: GroupSummary[];
  featuredChallenges: ChallengeSummary[];
};

const ANNOUNCEMENTS: Announcement[] = [
  { id: "board", date: "Apr 14", title: "Landing → board split", href: "/board" },
  { id: "challenges", date: "Apr 14", title: "Real challenge system next", href: "/challenges/new" },
  { id: "groups", date: "Apr 14", title: "Create a group, invite operators", href: "/groups/new" },
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

export function buildLandingSnapshot(users: UserStats[], groups: GroupSummary[], challenges: ChallengeSummary[]): LandingSnapshot {
  const leaderboardUsers = [...users].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 5);
  const totalTokens = users.reduce((sum, user) => sum + user.totalTokens, 0);
  const totalEvents = users.reduce((sum, user) => sum + user.commits, 0);
  const uniqueSources = new Set(users.flatMap((user) => user.sources.map((source) => source.source)));
  const caseStudyUser = users.find((user) => user.username.toLowerCase() === "sharziki") ?? leaderboardUsers[0] ?? null;

  const metrics: LandingMetric[] = [
    { label: "operators", value: users.length.toString(), tone: users.length > 0 ? "accent" : "neutral" },
    { label: "events", value: formatCompact(totalEvents), tone: totalEvents > 0 ? "accent" : "neutral" },
    { label: "tokens", value: formatCompact(totalTokens), tone: totalTokens > 0 ? "accent" : "neutral" },
    { label: "sources", value: uniqueSources.size.toString(), tone: uniqueSources.size > 0 ? "accent" : "neutral" },
  ];

  const caseStudy: CaseStudySnapshot = caseStudyUser
    ? {
        label: "Case study 01",
        title: `${caseStudyUser.name}`,
        summary: "Real local logs. No filler accounts. First board is SXNA Labs dogfood.",
        bullets: [
          `${formatCompact(caseStudyUser.totalTokens)} total burn`,
          `${pluralize(caseStudyUser.commits, "verified event", "verified events")}`,
          caseStudyUser.topModels[0]?.model ?? "model mix pending",
        ],
        metrics: [
          { label: "operator", value: `@${caseStudyUser.username}` },
          { label: "weekly", value: formatCompact(caseStudyUser.weeklyTokens) },
          { label: "sources", value: caseStudyUser.sources.length.toString() },
          { label: "rank", value: users.length ? `#${users.findIndex((user) => user.id === caseStudyUser.id) + 1}` : "#1" },
        ],
      }
    : {
        label: "Case study 01",
        title: "Waiting on the first operator",
        summary: "Connect local logs. The board fills from real burn only.",
        bullets: ["Generate key", "Run sync", "Claim slot"],
        metrics: [
          { label: "operator", value: "—" },
          { label: "weekly", value: "0" },
          { label: "sources", value: uniqueSources.size.toString() },
          { label: "rank", value: "—" },
        ],
      };

  return {
    metrics,
    announcements: ANNOUNCEMENTS,
    caseStudy,
    leaderboardUsers,
    featuredGroups: groups.slice(0, 3),
    featuredChallenges: challenges.slice(0, 3),
  };
}

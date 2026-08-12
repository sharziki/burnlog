import { prisma } from "./db";
import { FORM_DAYS } from "./h2h";

const DAY = 24 * 60 * 60 * 1000;

/**
 * A team's burn, shaped for both the company roster and the team-vs-team page.
 *
 * `daily` is the only volume series here on purpose: everything the h2h page
 * scores is derived from it, so the two views can never disagree about who
 * burned what.
 */
export type TeamBurnProfile = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  /** FORM_DAYS buckets, chronological oldest→newest. */
  daily: number[];
  /** Sum of `daily` — the scored volume. */
  windowTokens: number;
  /** Lifetime total. Context only: it mostly measures how old the team is. */
  totalTokens: number;
  /** Distinct members who burned anything inside the window. */
  contributors: number;
  /** Distinct agents seen in the window. */
  sources: number;
  /** Distinct providers seen in the window. */
  providers: number;
};

export type TeamInput = { id: string; name: string; slug: string; memberIds: string[] };

/**
 * Midnight UTC, FORM_DAYS calendar days ago inclusive of today.
 *
 * Aligning to midnight matters because the daily rows come back date-truncated:
 * a "now minus 30×24h" boundary would land mid-day and silently drop the
 * oldest bucket's morning, which is exactly the kind of off-by-half-a-day that
 * makes a head-to-head verdict flip for no visible reason.
 */
function windowStart(now = new Date()): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight - (FORM_DAYS - 1) * DAY);
}

/**
 * Burn profiles for many teams in a fixed number of queries.
 *
 * Same reasoning as `getClubUsageBatch`: a company can hold ten teams, and
 * doing per-team round-trips would make the company page cost 6×N queries.
 * This does six no matter how many teams there are and partitions in memory.
 *
 * A team's burn is its members' personal events (clubId null) plus the events
 * its own shared API keys produced (clubId = the club) — the same definition
 * `getClubUsageBatch` uses, so company rollups match the clubs list exactly.
 */
export async function getTeamBurnProfilesBatch(teams: TeamInput[]): Promise<TeamBurnProfile[]> {
  if (teams.length === 0) return [];

  const clubIds = teams.map((t) => t.id);
  const memberIds = [...new Set(teams.flatMap((t) => t.memberIds))];
  const start = windowStart();
  const startMs = start.getTime();

  const noRows = <T>(v: T[]) => Promise.resolve(v);

  const [userDaily, clubDaily, userTotals, clubTotals, userMix, clubMix] = await Promise.all([
    memberIds.length
      ? prisma.$queryRaw<{ userId: string; day: Date; total: bigint }[]>`
          SELECT "userId",
                 date_trunc('day', "timestamp") AS day,
                 SUM("totalTokens")::bigint     AS total
          FROM "BurnEvent"
          WHERE "userId" = ANY(${memberIds})
            AND "clubId" IS NULL
            AND "timestamp" >= ${start}
          GROUP BY 1, 2
        `
      : noRows<{ userId: string; day: Date; total: bigint }>([]),
    prisma.$queryRaw<{ clubId: string; day: Date; total: bigint }[]>`
      SELECT "clubId",
             date_trunc('day', "timestamp") AS day,
             SUM("totalTokens")::bigint     AS total
      FROM "BurnEvent"
      WHERE "clubId" = ANY(${clubIds})
        AND "timestamp" >= ${start}
      GROUP BY 1, 2
    `,
    memberIds.length
      ? prisma.burnEvent.groupBy({
          by: ["userId"],
          where: { userId: { in: memberIds }, clubId: null },
          _sum: { totalTokens: true },
        })
      : noRows<{ userId: string; _sum: { totalTokens: number | null } }>([]),
    prisma.burnEvent.groupBy({
      by: ["clubId"],
      where: { clubId: { in: clubIds } },
      _sum: { totalTokens: true },
    }),
    // Source and provider come back in one group-by: the distinct counts of
    // each are recoverable from the cross product, and two queries here would
    // buy nothing.
    memberIds.length
      ? prisma.burnEvent.groupBy({
          by: ["userId", "source", "provider"],
          where: { userId: { in: memberIds }, clubId: null, timestamp: { gte: start } },
        })
      : noRows<{ userId: string; source: string; provider: string }>([]),
    prisma.burnEvent.groupBy({
      by: ["clubId", "source", "provider"],
      where: { clubId: { in: clubIds }, timestamp: { gte: start } },
    }),
  ]);

  const bucketOf = (day: Date) => Math.floor((day.getTime() - startMs) / DAY);

  const dailyByUser = new Map<string, number[]>();
  for (const row of userDaily) {
    const buckets = dailyByUser.get(row.userId) ?? Array(FORM_DAYS).fill(0);
    const idx = bucketOf(row.day);
    if (idx >= 0 && idx < FORM_DAYS) buckets[idx] += Number(row.total);
    dailyByUser.set(row.userId, buckets);
  }

  const dailyByClub = new Map<string, number[]>();
  for (const row of clubDaily) {
    const buckets = dailyByClub.get(row.clubId) ?? Array(FORM_DAYS).fill(0);
    const idx = bucketOf(row.day);
    if (idx >= 0 && idx < FORM_DAYS) buckets[idx] += Number(row.total);
    dailyByClub.set(row.clubId, buckets);
  }

  const totalByUser = new Map(userTotals.map((r) => [r.userId, r._sum.totalTokens ?? 0]));
  const totalByClub = new Map(clubTotals.map((r) => [r.clubId ?? "", r._sum.totalTokens ?? 0]));

  const mixByUser = new Map<string, { sources: Set<string>; providers: Set<string> }>();
  for (const row of userMix) {
    const mix = mixByUser.get(row.userId) ?? { sources: new Set(), providers: new Set() };
    mix.sources.add(row.source);
    mix.providers.add(row.provider);
    mixByUser.set(row.userId, mix);
  }
  const mixByClub = new Map<string, { sources: Set<string>; providers: Set<string> }>();
  for (const row of clubMix) {
    const key = row.clubId ?? "";
    const mix = mixByClub.get(key) ?? { sources: new Set(), providers: new Set() };
    mix.sources.add(row.source);
    mix.providers.add(row.provider);
    mixByClub.set(key, mix);
  }

  return teams.map((team) => {
    const daily = Array<number>(FORM_DAYS).fill(0);
    const sources = new Set<string>();
    const providers = new Set<string>();
    let contributors = 0;
    let totalTokens = totalByClub.get(team.id) ?? 0;

    for (const memberId of team.memberIds) {
      const buckets = dailyByUser.get(memberId);
      if (buckets) {
        for (let i = 0; i < FORM_DAYS; i++) daily[i] += buckets[i];
        contributors++;
      }
      totalTokens += totalByUser.get(memberId) ?? 0;
      const mix = mixByUser.get(memberId);
      if (mix) {
        for (const s of mix.sources) sources.add(s);
        for (const p of mix.providers) providers.add(p);
      }
    }

    const serviceDaily = dailyByClub.get(team.id);
    if (serviceDaily) for (let i = 0; i < FORM_DAYS; i++) daily[i] += serviceDaily[i];
    const serviceMix = mixByClub.get(team.id);
    if (serviceMix) {
      for (const s of serviceMix.sources) sources.add(s);
      for (const p of serviceMix.providers) providers.add(p);
    }

    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      memberCount: team.memberIds.length,
      daily,
      windowTokens: daily.reduce((s, v) => s + v, 0),
      totalTokens,
      contributors,
      sources: sources.size,
      providers: providers.size,
    };
  });
}

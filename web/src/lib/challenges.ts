import { randomBytes } from "crypto";
import { prisma } from "./db";
import { notifyUser } from "./notifications";
import { evaluateAndNotify } from "./achievements";

/**
 * Challenges are scored *derivatively*: nothing is written per burn event.
 * A challenge is a window plus a scoring rule, so standings are always
 * consistent with the leaderboard and a challenge costs nothing to run.
 *
 * Settlement is lazy — the first read after `endsAt` freezes the result.
 * No cron, no queue.
 */

export type ChallengeTypeId =
  | "sprint"
  | "efficiency"
  | "provider"
  | "streak"
  | "cost-cap";

export type ChallengeType = {
  id: ChallengeTypeId;
  label: string;
  /** One-line pitch shown in the create form. */
  blurb: string;
  /** What the score column means. */
  unit: string;
  /** "high" = biggest score wins, "low" = smallest score wins. */
  direction: "high" | "low";
  /** Allowed durations in days. */
  durations: number[];
  icon: string;
};

export const CHALLENGE_TYPES: ChallengeType[] = [
  {
    id: "sprint",
    label: "Token Sprint",
    blurb: "Straight fight. Most tokens burned in the window wins.",
    unit: "tokens",
    direction: "high",
    durations: [3, 7, 14, 30],
    icon: "▲",
  },
  {
    id: "efficiency",
    label: "Efficiency Gauntlet",
    blurb: "Fewest tokens per call wins. Needs 20+ calls to qualify.",
    unit: "tok/call",
    direction: "low",
    durations: [7, 14],
    icon: "◇",
  },
  {
    id: "provider",
    label: "Provider Lock",
    blurb: "Pick a provider. Highest share of your burn on it wins.",
    unit: "% share",
    direction: "high",
    durations: [7, 14],
    icon: "◈",
  },
  {
    id: "streak",
    label: "Streak Race",
    blurb: "First to hit the target streak inside the window wins.",
    unit: "day streak",
    direction: "high",
    durations: [14, 30, 60],
    icon: "◆",
  },
  {
    id: "cost-cap",
    label: "Cost Cap",
    blurb: "Most calls without blowing the token budget. Overspend = out.",
    unit: "calls",
    direction: "high",
    durations: [7, 14],
    icon: "◎",
  },
];

export function challengeType(id: string): ChallengeType {
  return CHALLENGE_TYPES.find((t) => t.id === id) ?? CHALLENGE_TYPES[0];
}

export type ChallengeConfig = {
  /** provider-lock: which provider counts. */
  provider?: string;
  /** streak-race: consecutive days to reach. */
  targetStreak?: number;
  /** cost-cap: token ceiling. */
  budgetTokens?: number;
};

export function parseConfig(raw: string | null): ChallengeConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ChallengeConfig) : {};
  } catch {
    return {};
  }
}

export type Standing = {
  userId: string;
  username: string;
  name: string;
  image: string | null;
  /** Score in the type's unit. */
  score: number;
  /** Tokens burned in the window — always shown as context. */
  tokens: number;
  /** Calls (burn events) in the window. */
  calls: number;
  /** False when the entrant hasn't met the type's minimum bar yet. */
  qualified: boolean;
  /** Why they're not qualified, for a helpful empty state. */
  note: string | null;
  place: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** Minimum calls before an Efficiency Gauntlet score counts. */
const EFFICIENCY_MIN_CALLS = 20;
/** Minimum tokens before a Provider Lock share counts. */
const PROVIDER_MIN_TOKENS = 10_000;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Longest run of consecutive UTC days present in `days`. */
function longestRun(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const day of sorted) {
    const ms = Date.parse(day + "T00:00:00Z");
    run = prev && ms - prev === DAY ? run + 1 : 1;
    prev = ms;
    if (run > best) best = run;
  }
  return best;
}

type Entrant = {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
};

type WindowEvent = {
  userId: string;
  totalTokens: number;
  provider: string;
  timestamp: Date;
};

/**
 * Compute live standings for a challenge from raw burn events.
 * Exported separately from `getChallenge` so settlement and preview share it.
 */
export function computeStandings(
  type: ChallengeTypeId,
  config: ChallengeConfig,
  entrants: Entrant[],
  events: WindowEvent[],
): Standing[] {
  const byUser = new Map<string, WindowEvent[]>();
  for (const e of events) {
    const list = byUser.get(e.userId);
    if (list) list.push(e);
    else byUser.set(e.userId, [e]);
  }

  const rows = entrants.map((entrant) => {
    const mine = byUser.get(entrant.userId) ?? [];
    const tokens = mine.reduce((s, e) => s + e.totalTokens, 0);
    const calls = mine.length;

    let score = 0;
    let qualified = true;
    let note: string | null = null;

    switch (type) {
      case "sprint": {
        score = tokens;
        qualified = tokens > 0;
        if (!qualified) note = "no burn yet";
        break;
      }
      case "efficiency": {
        qualified = calls >= EFFICIENCY_MIN_CALLS;
        score = calls ? tokens / calls : 0;
        if (!qualified) note = `${EFFICIENCY_MIN_CALLS - calls} more calls to qualify`;
        break;
      }
      case "provider": {
        const target = config.provider ?? "anthropic";
        const onTarget = mine
          .filter((e) => e.provider === target)
          .reduce((s, e) => s + e.totalTokens, 0);
        qualified = tokens >= PROVIDER_MIN_TOKENS;
        score = tokens ? (onTarget / tokens) * 100 : 0;
        if (!qualified) note = "under 10K tokens — burn more to qualify";
        break;
      }
      case "streak": {
        const days = new Set(mine.map((e) => utcDay(e.timestamp)));
        score = longestRun(days);
        const target = config.targetStreak ?? 14;
        qualified = score > 0;
        if (!qualified) note = "no burn yet";
        else if (score >= target) note = "target reached";
        break;
      }
      case "cost-cap": {
        const budget = config.budgetTokens ?? 1_000_000;
        qualified = tokens <= budget;
        score = qualified ? calls : 0;
        if (!qualified) note = "over budget — eliminated";
        break;
      }
    }

    return {
      userId: entrant.userId,
      username: entrant.username ?? entrant.userId,
      name: entrant.name ?? entrant.username ?? "anon",
      image: entrant.image,
      score,
      tokens,
      calls,
      qualified,
      note,
      place: 0,
    };
  });

  const dir = challengeType(type).direction;
  rows.sort((a, b) => {
    // Unqualified entrants always sort below qualified ones, regardless of score.
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (a.score !== b.score) return dir === "high" ? b.score - a.score : a.score - b.score;
    // Tokens burned is the tiebreak everywhere — this is burnlog, after all.
    return b.tokens - a.tokens;
  });
  rows.forEach((r, i) => {
    r.place = i + 1;
  });
  return rows;
}

export type ChallengeView = {
  id: string;
  name: string;
  type: ChallengeTypeId;
  typeLabel: string;
  unit: string;
  icon: string;
  config: ChallengeConfig;
  inviteCode: string;
  hostUsername: string;
  startsAt: string;
  endsAt: string;
  status: "upcoming" | "active" | "ended";
  /** Milliseconds until endsAt (or startsAt when upcoming). Negative once over. */
  msRemaining: number;
  standings: Standing[];
  winnerUsername: string | null;
  rematchOfId: string | null;
};

function liveStatus(startsAt: Date, endsAt: Date, now: number): ChallengeView["status"] {
  if (now < startsAt.getTime()) return "upcoming";
  if (now >= endsAt.getTime()) return "ended";
  return "active";
}

export function newInviteCode(): string {
  // 8 chars of base32-ish alphabet — short enough to read over a call,
  // long enough that codes aren't guessable.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(8);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Load a challenge with live (or frozen) standings.
 * Settles the challenge in-place the first time it's read after `endsAt`.
 */
export async function getChallenge(
  where: { id: string } | { inviteCode: string },
): Promise<ChallengeView | null> {
  const challenge = await prisma.challenge.findUnique({
    where: where as { id: string },
    include: {
      host: { select: { username: true } },
      winner: { select: { username: true } },
      entries: {
        include: {
          user: { select: { id: true, username: true, name: true, image: true } },
        },
      },
    },
  });
  if (!challenge) return null;

  const now = Date.now();
  const status = liveStatus(challenge.startsAt, challenge.endsAt, now);
  const type = challenge.type as ChallengeTypeId;
  const config = parseConfig(challenge.config);
  const entrants: Entrant[] = challenge.entries.map((e) => ({
    userId: e.user.id,
    username: e.user.username,
    name: e.user.name,
    image: e.user.image,
  }));

  const events = entrants.length
    ? await prisma.burnEvent.findMany({
        where: {
          userId: { in: entrants.map((e) => e.userId) },
          timestamp: { gte: challenge.startsAt, lt: challenge.endsAt },
        },
        select: { userId: true, totalTokens: true, provider: true, timestamp: true },
      })
    : [];

  const standings = computeStandings(type, config, entrants, events);

  // Lazy settlement: freeze the result the first time anyone looks after the
  // window closes. Concurrent readers race harmlessly — they compute the same
  // standings from the same immutable event window.
  let winnerUsername = challenge.winner?.username ?? null;
  if (status === "ended" && challenge.status !== "ended") {
    const winner = standings.find((s) => s.qualified) ?? null;
    winnerUsername = winner?.username ?? null;
    await prisma.$transaction([
      prisma.challenge.update({
        where: { id: challenge.id },
        data: {
          status: "ended",
          settledAt: new Date(),
          winnerId: winner?.userId ?? null,
        },
      }),
      ...standings.map((s) =>
        prisma.challengeEntry.update({
          where: { challengeId_userId: { challengeId: challenge.id, userId: s.userId } },
          data: { finalScore: s.score, finalPlace: s.place },
        }),
      ),
    ]);

    // Announce the result to everyone who entered. Fire-and-forget: a failed
    // notification must never block the page that triggered settlement.
    void Promise.allSettled([
      ...standings.map((s) =>
        notifyUser({
          userId: s.userId,
          type: "challenge",
          message:
            s.userId === winner?.userId
              ? `You won "${challenge.name}"!`
              : winner
                ? `"${challenge.name}" ended — @${winner.username} took it. You placed ${s.place}.`
                : `"${challenge.name}" ended with no qualifying entrant.`,
          meta: { challengeId: challenge.id, place: s.place, won: s.userId === winner?.userId },
          link: `/c/${challenge.inviteCode}`,
        }),
      ),
      // A win can unlock the Duelist achievement.
      winner ? evaluateAndNotify(winner.userId) : Promise.resolve([]),
    ]);
  }

  const t = challengeType(type);
  return {
    id: challenge.id,
    name: challenge.name,
    type,
    typeLabel: t.label,
    unit: t.unit,
    icon: t.icon,
    config,
    inviteCode: challenge.inviteCode,
    hostUsername: challenge.host.username ?? "anon",
    startsAt: challenge.startsAt.toISOString(),
    endsAt: challenge.endsAt.toISOString(),
    status,
    msRemaining:
      status === "upcoming"
        ? challenge.startsAt.getTime() - now
        : challenge.endsAt.getTime() - now,
    standings,
    winnerUsername,
    rematchOfId: challenge.rematchOfId,
  };
}

/** Every challenge a user has entered, newest first. */
export async function getUserChallenges(userId: string): Promise<ChallengeView[]> {
  const entries = await prisma.challengeEntry.findMany({
    where: { userId },
    select: { challengeId: true },
    orderBy: { joinedAt: "desc" },
    take: 25,
  });
  const views = await Promise.all(entries.map((e) => getChallenge({ id: e.challengeId })));
  return views.filter((v): v is ChallengeView => v !== null);
}

/** Public challenges anyone can browse and jump into. */
export async function getOpenChallenges(limit = 12): Promise<ChallengeView[]> {
  const rows = await prisma.challenge.findMany({
    where: { status: "active", endsAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true },
  });
  const views = await Promise.all(rows.map((r) => getChallenge({ id: r.id })));
  return views.filter((v): v is ChallengeView => v !== null);
}

/** "2d 4h left" / "ends in 12m" / "ended" */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "ended";
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins % 60}m left`;
  return `${mins}m left`;
}

/** Score formatted for its unit. */
export function formatScore(type: ChallengeTypeId, score: number): string {
  switch (type) {
    case "sprint":
      return score >= 1e6
        ? (score / 1e6).toFixed(1) + "M"
        : score >= 1e3
          ? (score / 1e3).toFixed(1) + "K"
          : String(Math.round(score));
    case "efficiency":
      return Math.round(score).toLocaleString();
    case "provider":
      return score.toFixed(1) + "%";
    case "streak":
      return `${Math.round(score)}d`;
    case "cost-cap":
      return String(Math.round(score));
  }
}

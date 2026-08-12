export type Rank = {
  name: string;
  min: number;
  max: number;
  color: string;
  icon: string;
  /** Shown on the rank ladder — what it took to get here. */
  blurb: string;
};

/**
 * The rank ladder.
 *
 * Originally topped out at Supernova/10M, which real usage blew straight
 * through — a heavy agent user was measured at 140B, four orders of magnitude
 * past the ceiling, so the top rank stopped meaning anything. The scale is
 * logarithmic and now runs to 100B, where "burning a hundred billion tokens"
 * gets a name worth having.
 *
 * Glyphs are deliberately geometric + ∞ so they render in IBM Plex Mono
 * everywhere the ladder appears.
 */
export const RANKS: Rank[] = [
  { name: "Spark",         min: 0,               max: 99_999,              color: "#52525B", icon: "○", blurb: "you showed up" },
  { name: "Ember",         min: 100_000,         max: 499_999,             color: "#D97706", icon: "◐", blurb: "something's catching" },
  { name: "Blaze",         min: 500_000,         max: 1_999_999,           color: "#F59E0B", icon: "●", blurb: "a real habit now" },
  { name: "Inferno",       min: 2_000_000,       max: 9_999_999,           color: "#EF4444", icon: "◉", blurb: "shipping hard" },
  { name: "Supernova",     min: 10_000_000,      max: 99_999_999,          color: "#A855F7", icon: "✦", blurb: "agents running hot" },
  { name: "Quasar",        min: 100_000_000,     max: 999_999_999,         color: "#60A5FA", icon: "✧", blurb: "visible from orbit" },
  { name: "Singularity",   min: 1_000_000_000,   max: 9_999_999_999,       color: "#22D3EE", icon: "◆", blurb: "a billion tokens deep" },
  { name: "Event Horizon", min: 10_000_000_000,  max: 99_999_999_999,      color: "#FAFAFA", icon: "◈", blurb: "nothing escapes" },
  { name: "Heat Death",    min: 100_000_000_000, max: Number.POSITIVE_INFINITY, color: "#F472B6", icon: "∞", blurb: "you burned the universe down" },
];

export function getRank(tokens: number): Rank {
  return RANKS.find((r) => tokens >= r.min && tokens <= r.max) ?? RANKS[0];
}

/** The next rank up, and how far away it is. Null once you're at the top. */
export function nextRank(tokens: number): { rank: Rank; remaining: number } | null {
  const current = getRank(tokens);
  const idx = RANKS.findIndex((r) => r.name === current.name);
  const next = RANKS[idx + 1];
  return next ? { rank: next, remaining: Math.max(0, next.min - tokens) } : null;
}

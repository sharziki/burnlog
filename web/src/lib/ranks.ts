export type Rank = {
  name: string;
  min: number;
  max: number;
  color: string;
  icon: string;
};

export type RankProgress = {
  rank: Rank;
  nextRank: Rank | null;
  progress: number;
  progressPercent: number;
  tokensIntoRank: number;
  rankSpan: number | null;
  tokensRemainingToNextRank: number | null;
  nextRankAt: number | null;
};

export const RANKS: Rank[] = [
  { name: "Spark", min: 0, max: 24_999, color: "#52525B", icon: "○" },
  { name: "Kindling", min: 25_000, max: 74_999, color: "#A16207", icon: "◔" },
  { name: "Ember", min: 75_000, max: 149_999, color: "#D97706", icon: "◐" },
  { name: "Flare", min: 150_000, max: 299_999, color: "#EA580C", icon: "◕" },
  { name: "Blaze", min: 300_000, max: 599_999, color: "#F97316", icon: "●" },
  { name: "Bonfire", min: 600_000, max: 999_999, color: "#FB7185", icon: "✦" },
  { name: "Wildfire", min: 1_000_000, max: 2_499_999, color: "#F43F5E", icon: "✺" },
  { name: "Inferno", min: 2_500_000, max: 4_999_999, color: "#EF4444", icon: "✹" },
  { name: "Firestorm", min: 5_000_000, max: 9_999_999, color: "#DC2626", icon: "✸" },
  { name: "Solaris", min: 10_000_000, max: 24_999_999, color: "#F59E0B", icon: "☼" },
  { name: "Supernova", min: 25_000_000, max: 49_999_999, color: "#FDE68A", icon: "✶" },
  { name: "Quasar", min: 50_000_000, max: 99_999_999, color: "#E879F9", icon: "✷" },
  { name: "Singularity", min: 100_000_000, max: 249_999_999, color: "#C084FC", icon: "⬢" },
  { name: "Event Horizon", min: 250_000_000, max: 999_999_999, color: "#818CF8", icon: "⬣" },
  { name: "Omega Burn", min: 1_000_000_000, max: 2_499_999_999, color: "#FAFAFA", icon: "✴" },
  { name: "Celestial Flame", min: 2_500_000_000, max: 4_999_999_999, color: "#67E8F9", icon: "✺" },
  { name: "Nebula Crown", min: 5_000_000_000, max: 9_999_999_999, color: "#22D3EE", icon: "✵" },
  { name: "Titanstar", min: 10_000_000_000, max: 24_999_999_999, color: "#38BDF8", icon: "✹" },
  { name: "Mythic Core", min: 25_000_000_000, max: 49_999_999_999, color: "#4F46E5", icon: "❖" },
  { name: "Apex Singularity", min: 50_000_000_000, max: Number.POSITIVE_INFINITY, color: "#A78BFA", icon: "✦" },
];

export function getRank(tokens: number): Rank {
  return RANKS.find((r) => tokens >= r.min && tokens <= r.max) ?? RANKS[0];
}

export function getNextRank(tokens: number): Rank | null {
  const currentIndex = RANKS.findIndex((r) => tokens >= r.min && tokens <= r.max);
  return currentIndex >= 0 && currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null;
}

export function getRankProgress(tokens: number): RankProgress {
  const rank = getRank(tokens);
  const nextRank = getNextRank(tokens);

  if (!nextRank || rank.max === Number.POSITIVE_INFINITY) {
    return {
      rank,
      nextRank: null,
      progress: 1,
      progressPercent: 100,
      tokensIntoRank: Math.max(tokens - rank.min, 0),
      rankSpan: null,
      tokensRemainingToNextRank: null,
      nextRankAt: null,
    };
  }

  const rankSpan = nextRank.min - rank.min;
  const tokensIntoRank = Math.max(tokens - rank.min, 0);
  const progress = Math.max(0, Math.min(tokensIntoRank / rankSpan, 1));

  return {
    rank,
    nextRank,
    progress,
    progressPercent: Math.round(progress * 100),
    tokensIntoRank,
    rankSpan,
    tokensRemainingToNextRank: Math.max(nextRank.min - tokens, 0),
    nextRankAt: nextRank.min,
  };
}

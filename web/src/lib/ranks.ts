export type Rank = {
  name: string;
  min: number;
  max: number;
  color: string;
  icon: string;
};

export const RANKS: Rank[] = [
  { name: "Spark", min: 0, max: 99_999, color: "#6B7280", icon: "⚡" },
  { name: "Ember", min: 100_000, max: 499_999, color: "#F59E0B", icon: "🔥" },
  { name: "Blaze", min: 500_000, max: 1_999_999, color: "#EF4444", icon: "🔥" },
  { name: "Inferno", min: 2_000_000, max: 9_999_999, color: "#DC2626", icon: "🌋" },
  { name: "Supernova", min: 10_000_000, max: Number.POSITIVE_INFINITY, color: "#7C3AED", icon: "💥" },
];

export function getRank(tokens: number): Rank {
  return RANKS.find((r) => tokens >= r.min && tokens <= r.max) ?? RANKS[0];
}

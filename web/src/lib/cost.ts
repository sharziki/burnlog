export const DEFAULT_DOLLARS_PER_TOKEN = 0.00001;

export function dollarsPerToken() {
  const raw =
    process.env.NEXT_PUBLIC_BURNLOG_DOLLARS_PER_TOKEN ??
    process.env.BURNLOG_DOLLARS_PER_TOKEN;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_DOLLARS_PER_TOKEN;
}

/**
 * Per-bucket cost estimate, in dollars per million tokens.
 *
 * A single blended rate across all tokens is badly wrong for agent workloads.
 * Cached reads are roughly a tenth the price of fresh input, and heavy agent
 * users are overwhelmingly cache reads — one real account was 136B of mostly
 * cached codex context, where a flat rate reported $1.48M against a true cost
 * an order of magnitude lower. Overstating someone's spend by 10x is not a
 * rounding error, it's alarming and wrong.
 *
 * These are blended mid-tier frontier prices, not any one provider's card.
 * Still an estimate — burnlog never sees which tier or discount you're on —
 * but the shape now matches how inference is actually billed.
 */
const USD_PER_MILLION = {
  input: 3.0,
  output: 15.0,
  /** Cache reads are the cheap path — this is the whole point of caching. */
  cacheRead: 0.3,
  /** Writing to cache costs a premium over plain input. */
  cacheCreate: 3.75,
};

export type TokenBuckets = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export function estimateCostUsd(b: TokenBuckets): number {
  return (
    (b.inputTokens * USD_PER_MILLION.input +
      b.outputTokens * USD_PER_MILLION.output +
      b.cacheReadTokens * USD_PER_MILLION.cacheRead +
      b.cacheCreationTokens * USD_PER_MILLION.cacheCreate) /
    1_000_000
  );
}

/** Compact money, because "$1484222.82" is unreadable at a glance. */
export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

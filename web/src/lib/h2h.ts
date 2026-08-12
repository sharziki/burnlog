import type { UserStats } from "./stats";

/**
 * Head-to-head scoring.
 *
 * The previous version counted five categories, two of which measured the
 * same thing — "Est. spend" is literally total tokens times a constant, so
 * whoever won volume won it twice. It also scored lifetime totals, which
 * mostly rewards whoever signed up earlier, and scored tokens-per-session as
 * lower-is-better, directly contradicting the headline metric.
 *
 * This version scores five *independent* dimensions inside a shared window,
 * so the verdict actually reflects who is burning harder right now rather
 * than who has been around longest. Lifetime totals and cost stay on the
 * page as context, but they don't score.
 */

export type H2HMetric = {
  label: string;
  /** What this dimension is actually measuring, shown under the label. */
  hint: string;
  left: number;
  right: number;
  format: (v: number) => string;
  /** True when a smaller number is the better one. */
  lowerIsBetter?: boolean;
  /** Context only — rendered, never scored. */
  unscored?: boolean;
};

/** Differences under this are noise, not a win. */
const TIE_BAND = 0.05;

/**
 * Recent-form window, in days. Must be <= the 84-day heatmap.
 * Exported so team-vs-team (lib/companyH2h.ts) judges the same stretch of
 * time — two h2h pages that disagree about "recent" would be worse than none.
 */
export const FORM_DAYS = 30;

function tailSum(heatmap: number[], days: number): number {
  return heatmap.slice(-days).reduce((s, v) => s + v, 0);
}

function activeDays(heatmap: number[], days: number): number {
  return heatmap.slice(-days).filter((v) => v > 0).length;
}

function peakDay(heatmap: number[], days: number): number {
  const window = heatmap.slice(-days);
  return window.length ? Math.max(...window) : 0;
}

/** Distinct tools + providers actually used — a breadth signal, not volume. */
function range(u: UserStats): number {
  const providers = Object.values(u.providers).filter((v) => v > 0).length;
  return u.sources.length + providers;
}

export function compareUsers(
  l: UserStats,
  r: UserStats,
  formatTokens: (n: number) => string,
  formatUSD: (n: number) => string,
): H2HMetric[] {
  return [
    {
      label: `Recent form · ${FORM_DAYS}d`,
      hint: "tokens burned in the last 30 days",
      left: tailSum(l.heatmap, FORM_DAYS),
      right: tailSum(r.heatmap, FORM_DAYS),
      format: formatTokens,
    },
    {
      label: "Peak day",
      hint: "biggest single day in the window",
      left: peakDay(l.heatmap, FORM_DAYS),
      right: peakDay(r.heatmap, FORM_DAYS),
      format: formatTokens,
    },
    {
      label: "Active days",
      hint: `days burned out of the last ${FORM_DAYS}`,
      left: activeDays(l.heatmap, FORM_DAYS),
      right: activeDays(r.heatmap, FORM_DAYS),
      format: (v) => `${Math.round(v)}/${FORM_DAYS}`,
    },
    {
      label: "Current streak",
      hint: "consecutive days without breaking",
      left: l.streak,
      right: r.streak,
      format: (v) => `${Math.round(v)}d`,
    },
    {
      label: "Range",
      hint: "distinct agents + providers in play",
      left: range(l),
      right: range(r),
      format: (v) => String(Math.round(v)),
    },
    // ---- context, deliberately unscored ----
    {
      label: "All-time",
      hint: "lifetime total — rewards tenure, so it doesn't score",
      left: l.totalTokens,
      right: r.totalTokens,
      format: formatTokens,
      unscored: true,
    },
    {
      label: "Est. API cost",
      hint: "derived from total tokens, so it doesn't score",
      left: l.totalTokens,
      right: r.totalTokens,
      format: formatUSD,
      unscored: true,
    },
  ];
}

export type MetricOutcome = "left" | "right" | "tie";

/** Who takes a single row, with a dead band so near-ties aren't wins. */
export function outcomeOf(m: H2HMetric): MetricOutcome {
  if (m.unscored) return "tie";
  const { left, right, lowerIsBetter } = m;

  // Nobody scores on a dimension where neither has data — otherwise a user
  // with zero burn "wins" every lower-is-better row by default.
  if (left === 0 && right === 0) return "tie";

  const max = Math.max(left, right);
  if (max > 0 && Math.abs(left - right) / max < TIE_BAND) return "tie";

  const leftBetter = lowerIsBetter ? left < right : left > right;
  return leftBetter ? "left" : "right";
}

export type Verdict = {
  left: number;
  right: number;
  ties: number;
  winner: "left" | "right" | "draw";
  /** Plain-language explanation of the result. */
  summary: string;
};

export function verdictOf(
  metrics: H2HMetric[],
  leftName: string,
  rightName: string,
): Verdict {
  let left = 0;
  let right = 0;
  let ties = 0;
  const wonBy: Record<string, string[]> = { left: [], right: [] };

  for (const m of metrics) {
    if (m.unscored) continue;
    const outcome = outcomeOf(m);
    if (outcome === "left") {
      left++;
      wonBy.left.push(m.label);
    } else if (outcome === "right") {
      right++;
      wonBy.right.push(m.label);
    } else {
      ties++;
    }
  }

  const winner = left === right ? "draw" : left > right ? "left" : "right";
  const name = winner === "left" ? leftName : rightName;
  const takes = winner === "left" ? wonBy.left : wonBy.right;

  let summary: string;
  if (left === 0 && right === 0) {
    summary = "Not enough recent burn from either side to call it.";
  } else if (winner === "draw") {
    summary = `Dead even at ${left}–${right}. Someone needs to ship more.`;
  } else {
    summary = `${name} takes it ${Math.max(left, right)}–${Math.min(left, right)} on ${takes
      .slice(0, 2)
      .map((s) => s.toLowerCase())
      .join(" and ")}${takes.length > 2 ? ` (+${takes.length - 2} more)` : ""}.`;
  }

  return { left, right, ties, winner, summary };
}

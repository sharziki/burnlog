import { FORM_DAYS, type H2HMetric } from "./h2h";
import type { TeamBurnProfile } from "./companyUsage";

/**
 * Team-vs-team scoring, on the same terms as user-vs-user in ./h2h.ts.
 *
 * The rules that matter there matter more here, because a company's teams are
 * almost never the same age or the same size:
 *
 *  - only the last FORM_DAYS count, so the team that was spun up first doesn't
 *    win on back catalogue;
 *  - lifetime total and estimated cost render as context and never score —
 *    cost is total tokens times a constant, so scoring both would hand the
 *    volume winner the match twice;
 *  - headcount is context too. A big team is not a hard-working team, and
 *    scoring it would just reward whoever ran the most invites.
 *
 * For the same reason there is no "tokens per member" row: it is recent form
 * divided by contributors, both of which already score, so it would be the
 * same signal a third time wearing a different label.
 *
 * The verdict itself (tie band, win counting, summary) comes from ./h2h.ts
 * untouched — see `outcomeOf` and `verdictOf`.
 */
export function compareTeams(
  l: TeamBurnProfile,
  r: TeamBurnProfile,
  formatTokens: (n: number) => string,
  formatUSD: (n: number) => string,
): H2HMetric[] {
  const peak = (t: TeamBurnProfile) => (t.daily.length ? Math.max(...t.daily) : 0);
  const active = (t: TeamBurnProfile) => t.daily.filter((v) => v > 0).length;
  const range = (t: TeamBurnProfile) => t.sources + t.providers;

  return [
    {
      label: `Recent form · ${FORM_DAYS}d`,
      hint: `tokens the team burned in the last ${FORM_DAYS} days`,
      left: l.windowTokens,
      right: r.windowTokens,
      format: formatTokens,
    },
    {
      label: "Peak day",
      hint: "biggest single day across the whole team",
      left: peak(l),
      right: peak(r),
      format: formatTokens,
    },
    {
      label: "Active days",
      hint: `days the team burned out of the last ${FORM_DAYS}`,
      left: active(l),
      right: active(r),
      format: (v) => `${Math.round(v)}/${FORM_DAYS}`,
    },
    {
      label: "Contributors",
      hint: "members who actually burned in the window",
      left: l.contributors,
      right: r.contributors,
      format: (v) => String(Math.round(v)),
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
    {
      label: "Headcount",
      hint: "roster size — a bigger team isn't a win",
      left: l.memberCount,
      right: r.memberCount,
      format: (v) => String(Math.round(v)),
      unscored: true,
    },
  ];
}

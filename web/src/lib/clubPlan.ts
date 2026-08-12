export type ClubPlan = "free" | "team" | "company" | "enterprise";

export type ClubPlanLimits = {
  memberLimit: number;
  teamKeyLimit: number;
  /** Per-seat monthly price. Null when the plan isn't sold by the seat. */
  monthlyPriceUsdPerSeat: number | null;
  /**
   * Flat monthly price for the whole account. Company is billed once for the
   * org rather than per head, so its price lives here and its per-seat price
   * is null — otherwise every pricing surface would render "$30 per member".
   */
  monthlyPriceUsdFlat: number | null;
  /**
   * How many clubs the plan may hold. 1 means the club *is* the unit; only
   * Company and above own several teams that can be pointed at each other.
   */
  teamLimit: number;
};

export const CLUB_PLANS: Record<ClubPlan, ClubPlanLimits> = {
  free: { memberLimit: 5, teamKeyLimit: 2, monthlyPriceUsdPerSeat: 0, monthlyPriceUsdFlat: 0, teamLimit: 1 },
  team: { memberLimit: 25, teamKeyLimit: 10, monthlyPriceUsdPerSeat: 12, monthlyPriceUsdFlat: null, teamLimit: 1 },
  company: { memberLimit: 250, teamKeyLimit: 50, monthlyPriceUsdPerSeat: null, monthlyPriceUsdFlat: 30, teamLimit: 10 },
  enterprise: { memberLimit: 500, teamKeyLimit: 50, monthlyPriceUsdPerSeat: null, monthlyPriceUsdFlat: null, teamLimit: 100 },
};

export function clubPlan(value: string | null | undefined): ClubPlan {
  return value === "team" || value === "company" || value === "enterprise" ? value : "free";
}

export function clubLimits(value: string | null | undefined) {
  return CLUB_PLANS[clubPlan(value)];
}

/**
 * A company's plan, which unlike a club's never falls back to "free" — a
 * Company row only exists because the tier was bought, so an unrecognised
 * value means bad data, not a free account.
 */
export function companyPlan(value: string | null | undefined): ClubPlan {
  return value === "enterprise" ? "enterprise" : "company";
}

export function companyLimits(value: string | null | undefined) {
  return CLUB_PLANS[companyPlan(value)];
}

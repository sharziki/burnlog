export type ClubPlan = "free" | "team" | "enterprise";

export const CLUB_PLANS: Record<ClubPlan, { memberLimit: number; teamKeyLimit: number; monthlyPriceUsdPerSeat: number | null }> = {
  free: { memberLimit: 5, teamKeyLimit: 2, monthlyPriceUsdPerSeat: 0 },
  team: { memberLimit: 25, teamKeyLimit: 10, monthlyPriceUsdPerSeat: 12 },
  enterprise: { memberLimit: 500, teamKeyLimit: 50, monthlyPriceUsdPerSeat: null },
};

export function clubPlan(value: string | null | undefined): ClubPlan {
  return value === "team" || value === "enterprise" ? value : "free";
}

export function clubLimits(value: string | null | undefined) {
  return CLUB_PLANS[clubPlan(value)];
}

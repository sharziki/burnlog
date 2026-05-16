export type ClimateImpactEstimate = {
  tokenCount: number;
  energyKwh: { low: number; mid: number; high: number };
  co2eKg: { low: number; mid: number; high: number };
  methodology: string;
  caveat: string;
};

const ENERGY_KWH_PER_MILLION_TOKENS = {
  low: 0.2,
  high: 0.8,
};

const GRID_CO2E_KG_PER_KWH = {
  low: 0.25,
  high: 0.55,
};

function round(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

export function estimateClimateImpact(tokenCount: number): ClimateImpactEstimate {
  const inMillions = Math.max(tokenCount, 0) / 1_000_000;
  const energyLow = inMillions * ENERGY_KWH_PER_MILLION_TOKENS.low;
  const energyHigh = inMillions * ENERGY_KWH_PER_MILLION_TOKENS.high;
  const energyMid = (energyLow + energyHigh) / 2;

  const co2Low = energyLow * GRID_CO2E_KG_PER_KWH.low;
  const co2High = energyHigh * GRID_CO2E_KG_PER_KWH.high;
  const co2Mid = (co2Low + co2High) / 2;

  return {
    tokenCount,
    energyKwh: {
      low: round(energyLow),
      mid: round(energyMid),
      high: round(energyHigh),
    },
    co2eKg: {
      low: round(co2Low),
      mid: round(co2Mid),
      high: round(co2High),
    },
    methodology:
      "Estimated from total token count using a blended inference energy range and a broad grid-intensity range.",
    caveat:
      "Estimated only — actual impact varies a lot by model size, hardware, datacenter efficiency, caching, and regional electricity mix.",
  };
}

export function formatEnergyEstimateRange(low: number, high: number): string {
  if (high >= 1) return `${low.toFixed(1)}–${high.toFixed(1)} kWh`;
  return `${Math.round(low * 1000)}–${Math.round(high * 1000)} Wh`;
}

export function formatCo2eEstimateRange(low: number, high: number): string {
  if (high >= 1) return `${low.toFixed(1)}–${high.toFixed(1)} kg CO2e`;
  if (high >= 0.001) return `${Math.round(low * 1000)}–${Math.round(high * 1000)} g CO2e`;
  return `${Math.round(low * 1_000_000)}–${Math.round(high * 1_000_000)} mg CO2e`;
}

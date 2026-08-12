/**
 * Environmental impact of token burn.
 *
 * Every number here is an ESTIMATE built from public figures, not a
 * measurement. Real energy per token varies by an order of magnitude with
 * model size, batching, hardware, and datacentre efficiency, and providers
 * don't publish per-request figures. So: pick defensible defaults, document
 * where they come from, make them configurable, and label the output as an
 * estimate everywhere it's shown. Never present these as measured.
 */

/**
 * Energy per 1K tokens, in watt-hours.
 *
 * Anchored on the widely-cited ~0.3 Wh figure for a typical modern chat query
 * (Altman's 0.34 Wh, and Epoch AI's independent GPT-4o estimate, both land
 * near 0.3), against a typical ~1K-token request. Cache reads cost far less
 * than fresh prompt processing, so this skews conservative for heavy-cache
 * agent workloads.
 */
const DEFAULT_WH_PER_1K_TOKENS = 0.3;

/**
 * Grid carbon intensity, grams CO2e per kWh. ~400 is a reasonable global
 * average; the US grid is nearer 370 and the world nearer 480. Hyperscalers
 * with heavy renewable contracts run well below this, so it skews high.
 */
const DEFAULT_G_CO2E_PER_KWH = 400;

/**
 * Litres of water per kWh — datacentre cooling plus water consumed generating
 * the electricity. Public estimates cluster around 1.8 L/kWh.
 */
const DEFAULT_L_WATER_PER_KWH = 1.8;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function impactConstants() {
  return {
    whPer1kTokens: envNumber("NEXT_PUBLIC_BURNLOG_WH_PER_1K_TOKENS", DEFAULT_WH_PER_1K_TOKENS),
    gCo2ePerKwh: envNumber("NEXT_PUBLIC_BURNLOG_G_CO2E_PER_KWH", DEFAULT_G_CO2E_PER_KWH),
    lWaterPerKwh: envNumber("NEXT_PUBLIC_BURNLOG_L_WATER_PER_KWH", DEFAULT_L_WATER_PER_KWH),
  };
}

export type Impact = {
  /** Electricity, kilowatt-hours. */
  kwh: number;
  /** Carbon dioxide equivalent, grams. */
  gCo2e: number;
  /** Water consumed, litres. */
  litres: number;
};

export function impactOf(tokens: number): Impact {
  const { whPer1kTokens, gCo2ePerKwh, lWaterPerKwh } = impactConstants();
  const kwh = (tokens / 1000) * whPer1kTokens / 1000;
  return {
    kwh,
    gCo2e: kwh * gCo2ePerKwh,
    litres: kwh * lWaterPerKwh,
  };
}

// ---------- formatting ----------

export function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  if (kwh >= 1) return `${kwh.toFixed(1)} kWh`;
  return `${(kwh * 1000).toFixed(0)} Wh`;
}

export function formatCo2e(grams: number): string {
  if (grams >= 1_000_000) return `${(grams / 1_000_000).toFixed(2)} t`;
  if (grams >= 1000) return `${(grams / 1000).toFixed(1)} kg`;
  return `${Math.round(grams)} g`;
}

export function formatWater(litres: number): string {
  if (litres >= 1000) return `${(litres / 1000).toFixed(1)} m³`;
  if (litres >= 1) return `${litres.toFixed(1)} L`;
  return `${(litres * 1000).toFixed(0)} mL`;
}

/**
 * Human-scale comparisons. Abstract gram figures mean nothing to most people;
 * "about a 9km drive" does.
 */
export type Equivalent = { label: string; value: string };

/** Average petrol car, grams CO2e per km. */
const G_CO2E_PER_KM = 120;
/** Charging a phone, kWh. */
const KWH_PER_PHONE_CHARGE = 0.012;
/** A mature tree absorbs roughly 21 kg CO2 a year. */
const G_CO2E_PER_TREE_DAY = (21_000 / 365);

export function equivalents(impact: Impact): Equivalent[] {
  const km = impact.gCo2e / G_CO2E_PER_KM;
  const charges = impact.kwh / KWH_PER_PHONE_CHARGE;
  const treeDays = impact.gCo2e / G_CO2E_PER_TREE_DAY;

  return [
    {
      label: "driving",
      value: km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km.toFixed(km >= 10 ? 0 : 1)} km`,
    },
    {
      label: "phone charges",
      value:
        charges >= 1_000_000
          ? `${(charges / 1_000_000).toFixed(1)}M`
          : charges >= 1000
            ? `${(charges / 1000).toFixed(1)}k`
            : charges.toFixed(0),
    },
    {
      label: "tree-days to offset",
      value:
        treeDays >= 1000
          ? `${(treeDays / 1000).toFixed(1)}k`
          : treeDays.toFixed(treeDays >= 10 ? 0 : 1),
    },
  ];
}

/** One-line summary for compact places (badge subtitles, CLI output). */
export function impactSummary(tokens: number): string {
  const i = impactOf(tokens);
  return `${formatEnergy(i.kwh)} · ${formatCo2e(i.gCo2e)} CO₂e`;
}

/** Shown next to the numbers so nobody mistakes them for measurements. */
export const IMPACT_DISCLAIMER =
  "Rough estimate. Assumes ~0.3 Wh per 1K tokens and a 400 g CO₂e/kWh grid — real figures vary widely by model, batching, and datacentre.";

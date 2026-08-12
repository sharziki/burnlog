import pc from "picocolors";
import { loadConfig } from "../config.js";
import { formatTokens } from "../format.js";

/**
 * `burnlog me` — your own usage over a long window, in the terminal.
 *
 * Deliberately a *read*: `sync` uploads, `me` reports. Keeping them separate
 * means you can check your numbers without triggering a write, and the
 * six-month view stays fast because the server aggregates by day.
 */

const USAGE = `${pc.bold("burnlog me")} ${pc.dim("· your burn over time")}

  burnlog me [--days 180] [--json]

${pc.bold("flags")}
  --days <n>   window length (default 180, max 400)
  --sync       sync first, then report
  --json       machine-readable output
`;

type History = {
  ok: boolean;
  days: number;
  totals: {
    tokens: number;
    calls: number;
    activeDays: number;
    dailyAverage: number;
    estimatedCostUsd: number;
  };
  impact: { kwh: number; gCo2e: number; litres: number };
  peak: { date: string; tokens: number; calls: number } | null;
  series: { date: string; tokens: number; calls: number }[];
  monthly: { month: string; tokens: number }[];
  models: { model: string; tokens: number }[];
  sources: { source: string; tokens: number }[];
};

const BLOCKS = ["·", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Sparkline over the daily series, log-scaled so quiet days stay visible. */
function sparkline(values: number[], width = 60): string {
  if (!values.length) return "";
  // Bucket the series down to the target width.
  const bucketSize = Math.ceil(values.length / width);
  const buckets: number[] = [];
  for (let i = 0; i < values.length; i += bucketSize) {
    buckets.push(values.slice(i, i + bucketSize).reduce((s, v) => s + v, 0));
  }
  const max = Math.max(...buckets);
  if (max === 0) return pc.dim("·".repeat(buckets.length));

  return buckets
    .map((v) => {
      if (v === 0) return pc.dim(BLOCKS[0]);
      // Log scale: a single 10x day would otherwise flatten everything else.
      const ratio = Math.log10(1 + v) / Math.log10(1 + max);
      const idx = Math.max(1, Math.min(BLOCKS.length - 1, Math.round(ratio * (BLOCKS.length - 1))));
      return idx >= 6 ? pc.yellow(BLOCKS[idx]) : pc.dim(pc.yellow(BLOCKS[idx]));
    })
    .join("");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1] ?? month} ${y.slice(2)}`;
}

function bar(value: number, max: number, width = 24): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return pc.yellow("█".repeat(filled)) + pc.dim("─".repeat(Math.max(0, width - filled)));
}

export async function me(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login"));
    process.exit(1);
  }

  const daysIdx = args.indexOf("--days");
  const days = daysIdx !== -1 ? Number(args[daysIdx + 1]) : 180;
  const asJson = args.includes("--json");

  const res = await fetch(`${cfg.apiUrl}/api/me/history?days=${days}`, {
    headers: { authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    console.error(pc.red(`could not load history: ${res.status}`));
    process.exit(1);
  }
  const data = (await res.json()) as History;

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { totals, impact } = data;
  console.log();
  console.log(
    "  " + pc.bold("burnlog") + pc.dim(` · last ${data.days} days`),
  );
  console.log();

  if (totals.tokens === 0) {
    console.log(pc.dim("  nothing synced in this window. run ") + pc.bold("burnlog sync") + pc.dim("."));
    console.log();
    return;
  }

  // Headline
  console.log(
    "  " +
      pc.yellow(pc.bold(formatTokens(totals.tokens))) +
      pc.dim(" tokens · ") +
      pc.cyan(totals.calls.toLocaleString()) +
      pc.dim(" calls · ") +
      pc.bold(`$${totals.estimatedCostUsd.toFixed(2)}`) +
      pc.dim(" est. API cost"),
  );
  console.log(
    "  " +
      pc.dim("active ") +
      pc.bold(`${totals.activeDays}/${data.days}`) +
      pc.dim(" days · avg ") +
      pc.bold(formatTokens(totals.dailyAverage)) +
      pc.dim(" per active day"),
  );

  // Environmental cost, same question asked a different way.
  const co2 = impact.gCo2e >= 1000 ? `${(impact.gCo2e / 1000).toFixed(1)} kg` : `${Math.round(impact.gCo2e)} g`;
  const kwh = impact.kwh >= 1 ? `${impact.kwh.toFixed(1)} kWh` : `${(impact.kwh * 1000).toFixed(0)} Wh`;
  console.log(
    "  " +
      pc.dim("≈ ") +
      pc.bold(kwh) +
      pc.dim(" · ") +
      pc.bold(co2) +
      pc.dim(" CO₂e · ") +
      pc.bold(`${impact.litres.toFixed(1)} L`) +
      pc.dim(" water") +
      pc.dim("  (rough estimate)"),
  );

  // Daily curve
  console.log();
  console.log("  " + sparkline(data.series.map((s) => s.tokens)));
  console.log(
    "  " +
      pc.dim(data.series[0]?.date ?? "") +
      pc.dim(" ".repeat(Math.max(1, 60 - 20))) +
      pc.dim(data.series[data.series.length - 1]?.date ?? ""),
  );

  if (data.peak) {
    console.log();
    console.log(
      "  " + pc.dim("peak day  ") + pc.bold(data.peak.date) + pc.dim(" · ") + pc.yellow(formatTokens(data.peak.tokens)),
    );
  }

  // Monthly
  if (data.monthly.length > 1) {
    console.log();
    console.log("  " + pc.bold("by month"));
    const maxMonth = Math.max(...data.monthly.map((m) => m.tokens));
    for (const m of data.monthly) {
      console.log(
        "    " +
          pc.dim(monthLabel(m.month).padEnd(8)) +
          bar(m.tokens, maxMonth) +
          " " +
          formatTokens(m.tokens),
      );
    }
  }

  // Where it came from
  if (data.sources.length) {
    console.log();
    console.log("  " + pc.bold("by agent"));
    const maxSource = Math.max(...data.sources.map((s) => s.tokens));
    for (const s of data.sources.slice(0, 8)) {
      console.log(
        "    " + pc.dim(s.source.padEnd(14)) + bar(s.tokens, maxSource) + " " + formatTokens(s.tokens),
      );
    }
  }

  if (data.models.length) {
    console.log();
    console.log("  " + pc.bold("top models"));
    for (const m of data.models.slice(0, 6)) {
      console.log("    " + pc.dim(m.model.padEnd(30)) + pc.yellow(formatTokens(m.tokens)));
    }
  }

  console.log();
  console.log(pc.dim("  full view: ") + pc.cyan(`${cfg.apiUrl}/settings`));
  console.log();
}

import pc from "picocolors";
import { loadConfig, saveConfig } from "../config.js";
import { scanAll, totalTokens } from "../adapters/index.js";
import { ingest } from "../api.js";
import { formatTokens } from "../format.js";

const BATCH = 500;

export async function sync(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exit(1);
  }
  const results = scanAll();
  const events = results.flatMap((r) => r.events);
  if (!events.length) {
    console.log(pc.yellow("no events found across any adapter"));
    for (const r of results) {
      console.log("  " + pc.dim(r.source + ": ") + pc.dim(r.note ?? "0 events"));
    }
    return;
  }

  const total = events.reduce((s, e) => s + totalTokens(e), 0);
  console.log("found " + pc.cyan(events.length.toString()) + " events across adapters:");
  for (const r of results) {
    if (!r.events.length) continue;
    const t = r.events.reduce((s, e) => s + totalTokens(e), 0);
    console.log(
      "  " + pc.green("●") + " " + pc.bold(r.source.padEnd(14)) + pc.yellow(formatTokens(t)),
    );
  }
  console.log(pc.dim("total: ") + pc.yellow(formatTokens(total)));
  console.log();

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    process.stdout.write(
      pc.dim(`  uploading ${i + 1}-${i + chunk.length} / ${events.length}... `),
    );
    try {
      const res = await ingest(cfg.apiUrl, cfg.apiKey, chunk);
      inserted += res.inserted;
      skipped += res.skipped;
      process.stdout.write(pc.green("ok\n"));
    } catch (err) {
      process.stdout.write(pc.red("fail\n"));
      console.error("  " + pc.red(String(err)));
      process.exit(1);
    }
  }

  cfg.lastSync = new Date().toISOString();
  saveConfig(cfg);

  console.log();
  console.log(pc.green("✓ sync complete"));
  console.log("  inserted " + pc.cyan(inserted.toString()));
  console.log("  skipped  " + pc.dim(skipped.toString()) + pc.dim(" (already seen)"));
  console.log();
  console.log(pc.dim("view your leaderboard: ") + pc.cyan(cfg.apiUrl));
}

import pc from "picocolors";
import { loadConfig, saveConfig } from "../config.js";
import { scanAll, totalTokens } from "../adapters/index.js";
import { ingest, fetchRank } from "../api.js";
import { formatTokens } from "../format.js";

const BATCH = 500;

export async function sync(args: string[]): Promise<void> {
  const quiet = args.includes("--quiet") || args.includes("-q");
  const log = (msg: string) => {
    if (!quiet) console.log(msg);
  };
  const write = (msg: string) => {
    if (!quiet) process.stdout.write(msg);
  };

  const cfg = loadConfig();
  if (!cfg.apiKey) {
    if (quiet) process.exit(0); // silent no-op when run from a hook before login
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exit(1);
  }
  const results = scanAll();
  const events = results.flatMap((r) => r.events);
  if (!events.length) {
    if (quiet) return;
    console.log(pc.yellow("no events found across any adapter"));
    for (const r of results) {
      console.log("  " + pc.dim(r.source + ": ") + pc.dim(r.note ?? "0 events"));
    }
    return;
  }

  const total = events.reduce((s, e) => s + totalTokens(e), 0);
  log("found " + pc.cyan(events.length.toString()) + " events across adapters:");
  for (const r of results) {
    if (!r.events.length) continue;
    const t = r.events.reduce((s, e) => s + totalTokens(e), 0);
    log(
      "  " + pc.green("●") + " " + pc.bold(r.source.padEnd(14)) + pc.yellow(formatTokens(t)),
    );
  }
  log(pc.dim("total: ") + pc.yellow(formatTokens(total)));
  log("");

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    write(pc.dim(`  uploading ${i + 1}-${i + chunk.length} / ${events.length}... `));
    try {
      const res = await ingest(cfg.apiUrl, cfg.apiKey, chunk);
      inserted += res.inserted;
      skipped += res.skipped;
      write(pc.green("ok\n"));
    } catch (err) {
      if (quiet) process.exit(0); // hook context — fail silently
      process.stdout.write(pc.red("fail\n"));
      console.error("  " + pc.red(String(err)));
      process.exit(1);
    }
  }

  cfg.lastSync = new Date().toISOString();
  saveConfig(cfg);

  log("");
  log(pc.green("✓ sync complete"));
  log("  inserted " + pc.cyan(inserted.toString()));
  log("  skipped  " + pc.dim(skipped.toString()) + pc.dim(" (already seen)"));

  // Fetch and display leaderboard position
  if (!quiet) {
    const rank = await fetchRank(cfg.apiUrl, cfg.apiKey);
    if (rank) {
      log("");
      log(
        "  " +
          pc.bold(`@${rank.username}`) +
          pc.dim(" · ") +
          pc.yellow(`${rank.rankIcon} ${rank.rank}`) +
          pc.dim(" · ") +
          pc.cyan(formatTokens(rank.totalTokens)) +
          " tokens" +
          pc.dim(" · ") +
          pc.bold(`#${rank.position}`) +
          pc.dim(`/${rank.totalUsers}`),
      );
    }
  }

  log("");
  log(pc.dim("view your leaderboard: ") + pc.cyan(cfg.apiUrl));
}

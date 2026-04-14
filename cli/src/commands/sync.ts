import pc from "picocolors";
import { loadConfig, saveConfig } from "../config.js";
import { parseClaudeProjects, totalTokens } from "../parser.js";
import { ingest } from "../api.js";
import { formatTokens } from "../format.js";

const BATCH = 500;

export async function sync(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exit(1);
  }
  console.log(pc.dim("scanning " + cfg.claudeProjectsDir));
  const result = parseClaudeProjects(cfg.claudeProjectsDir!);
  if (!result.events.length) {
    console.log(pc.yellow("no events found"));
    return;
  }

  const total = result.events.reduce((s, e) => s + totalTokens(e), 0);
  console.log(
    "found " +
      pc.cyan(result.events.length.toString()) +
      " events (" +
      pc.yellow(formatTokens(total)) +
      " tokens)",
  );

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < result.events.length; i += BATCH) {
    const chunk = result.events.slice(i, i + BATCH);
    process.stdout.write(
      pc.dim(`  uploading ${i + 1}-${i + chunk.length} / ${result.events.length}... `),
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

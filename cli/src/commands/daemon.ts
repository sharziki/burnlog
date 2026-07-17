import pc from "picocolors";
import { loadConfig, saveConfig } from "../config.js";
import { scanAll, totalTokens } from "../adapters/index.js";
import { ingest } from "../api.js";
import { formatTokens } from "../format.js";

const POLL_MS = 30_000;
const BATCH = 500;

export async function daemon(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exit(1);
  }

  console.log(pc.bold("burnlog") + pc.dim(" · daemon"));
  console.log("  api url  " + pc.cyan(cfg.apiUrl));
  console.log("  interval " + pc.dim(`${POLL_MS / 1000}s`));
  console.log(pc.dim("  ctrl-c to stop"));
  console.log();

  let running = false;
  const seen = new Set<string>();

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const results = scanAll();
      const events = results.flatMap((r) => r.events);
      const fresh = events.filter((e) => {
        const key = `${e.source}:${e.requestId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) {
        process.stdout.write(pc.dim("·"));
        return;
      }
      const sum = fresh.reduce((s, e) => s + totalTokens(e), 0);
      process.stdout.write("\n");
      console.log(
        pc.dim(new Date().toISOString()) +
          "  " +
          pc.cyan(String(fresh.length)) +
          pc.dim(" new · ") +
          pc.yellow(formatTokens(sum)),
      );

      let inserted = 0;
      for (let i = 0; i < fresh.length; i += BATCH) {
        const chunk = fresh.slice(i, i + BATCH);
        try {
          const res = await ingest(cfg.apiUrl, cfg.apiKey!, chunk);
          inserted += res.inserted;
        } catch (err) {
          console.error(pc.red("  sync failed: ") + String(err));
          // Un-see these so next tick retries.
          for (const e of chunk) seen.delete(`${e.source}:${e.requestId}`);
          return;
        }
      }
      cfg.lastSync = new Date().toISOString();
      saveConfig(cfg);
      console.log(pc.green("  ✓ inserted ") + pc.cyan(String(inserted)));
    } finally {
      running = false;
    }
  };

  // First tick seeds the seen-set with everything already on disk without
  // uploading, so we only sync *new* activity while the daemon is running.
  const results = scanAll();
  for (const r of results) for (const e of r.events) seen.add(`${e.source}:${e.requestId}`);
  const startCount = seen.size;
  console.log(
    pc.dim("  baseline: ") +
      pc.cyan(String(startCount)) +
      pc.dim(" existing events — will only sync new activity from here"),
  );
  console.log();

  const interval = setInterval(() => void tick(), POLL_MS);
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n" + pc.dim("stopped"));
    process.exit(0);
  });
}

import pc from "picocolors";
import { loadConfig } from "../config.js";
import { runSync } from "./sync.js";
import { formatTokens } from "../format.js";

const POLL_MS = 30_000;

export async function daemon(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exitCode = 1;
    return;
  }

  console.log(pc.bold("burnlog") + pc.dim(" · daemon"));
  console.log("  api url  " + pc.cyan(cfg.apiUrl));
  console.log("  interval " + pc.dim(`${POLL_MS / 1000}s`));
  console.log(pc.dim("  ctrl-c to stop"));
  console.log();

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      // runSync advances its checkpoint only after every batch succeeds.
      // Failed and unattempted batches stay eligible, even after restart.
      const result = await runSync();
      if (result.inserted) console.log(`${new Date().toISOString()}  ${pc.green("✓ inserted")} ${result.inserted} · ${formatTokens(result.total)}`);
      else process.stdout.write(pc.dim("·"));
    } catch (err) {
      console.error(pc.red("  sync failed: ") + String(err));
    } finally {
      running = false;
    }
  };

  await tick();
  const interval = setInterval(() => void tick(), POLL_MS);
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n" + pc.dim("stopped"));
    process.exit(0);
  });
}

import pc from "picocolors";
import { loadConfig, saveConfig, configPath } from "../config.js";
import { fetchRank } from "../api.js";

export function login(args: string[]): void {
  const key = args[0];
  if (!key) {
    const cfg = loadConfig();
    console.error(pc.red("usage: burnlog login <api-key>"));
    console.error("grab a key from " + pc.cyan(`${cfg.apiUrl}/settings`));
    process.exit(1);
  }
  const cfg = loadConfig();
  cfg.apiKey = key;
  saveConfig(cfg);
  console.log(pc.green("✓") + " saved api key to " + pc.dim(configPath()));
  console.log("  api url: " + pc.cyan(cfg.apiUrl));

  // Validate the key (fire and forget — don't block on failure)
  fetchRank(cfg.apiUrl, key).then((rank) => {
    if (rank) {
      console.log(
        "  logged in as " +
          pc.bold(`@${rank.username}`) +
          pc.dim(" · ") +
          pc.yellow(`${rank.rankIcon} ${rank.rank}`),
      );
    }
    console.log();
    console.log(pc.dim("next:"));
    console.log("  " + pc.bold("burnlog sync") + pc.dim("     upload your existing burn history"));
    console.log("  " + pc.bold("burnlog install") + pc.dim("  auto-sync on every Claude Code session"));
  });
}

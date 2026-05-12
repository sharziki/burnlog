import pc from "picocolors";
import { loadConfig, configPath } from "../config.js";
import { fetchRank } from "../api.js";
import { formatTokens } from "../format.js";

export async function status(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  console.log();
  console.log(pc.bold("burnlog") + pc.dim(" · status"));
  console.log();
  console.log("  config file      " + pc.dim(configPath()));
  console.log("  api url          " + pc.cyan(cfg.apiUrl));
  console.log(
    "  api key          " +
      (cfg.apiKey
        ? pc.green(cfg.apiKey.slice(0, 8) + "..." + cfg.apiKey.slice(-4))
        : pc.red("(not set)")),
  );
  console.log("  claude dir       " + pc.dim(cfg.claudeProjectsDir ?? ""));
  console.log("  last sync        " + (cfg.lastSync ? pc.cyan(cfg.lastSync) : pc.dim("never")));

  if (cfg.apiKey) {
    process.stdout.write(pc.dim("\n  fetching stats... "));
    const rank = await fetchRank(cfg.apiUrl, cfg.apiKey);
    if (rank) {
      process.stdout.write(pc.green("ok\n\n"));
      console.log(
        "  " +
          pc.bold(`@${rank.username}`) +
          pc.dim(" · ") +
          pc.yellow(`${rank.rankIcon} ${rank.rank}`),
      );
      console.log(
        "  " +
          pc.cyan(formatTokens(rank.totalTokens)) +
          " tokens" +
          pc.dim(" · ") +
          "rank " +
          pc.bold(`#${rank.position}`) +
          pc.dim(` of ${rank.totalUsers}`),
      );
      console.log(
        "\n  " +
          pc.dim("profile: ") +
          pc.cyan(`${cfg.apiUrl}/u/${rank.username}`),
      );
    } else {
      process.stdout.write(pc.yellow("could not reach API\n"));
    }
  } else {
    console.log();
    console.log(pc.dim("  run ") + pc.bold("burnlog login <key>") + pc.dim(" to get started"));
    console.log(pc.dim("  grab a key from ") + pc.cyan(`${cfg.apiUrl}/settings`));
  }
  console.log();
}

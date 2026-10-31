import pc from "picocolors";
import { loadConfig, configPath } from "../config.js";
import { fetchRank } from "../api.js";
import { formatTokens } from "../format.js";
import { scheduleInstalled } from "./schedule.js";
import { BURNLOG_HOOK_RE, burnlogOnPath } from "./install.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawnSync } from "child_process";

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
  console.log("  last attempt     " + (cfg.syncHealth?.lastAttempt ?? "never"));
  console.log("  last success     " + (cfg.syncHealth?.lastSuccess ?? "never"));
  console.log("  last error       " + (cfg.syncHealth?.lastError ? pc.red(cfg.syncHealth.lastError) : pc.dim("none")));
  const settings = join(homedir(), ".claude", "settings.json");
  let hook = false;
  try { hook = existsSync(settings) && BURNLOG_HOOK_RE.test(readFileSync(settings, "utf8")); } catch { /* unreadable */ }
  console.log("  scheduled sync   " + (scheduleInstalled() ? "every 30 minutes" : "off"));
  console.log("  Claude hook      " + (hook ? "session end" : "off"));
  if (process.platform === "win32" && !burnlogOnPath()) {
    const prefix = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm prefix -g"], { encoding: "utf8" }).stdout?.trim();
    console.log("  command          " + pc.yellow("not on PATH; use npx -y @sxnalabs/burnlog@latest status"));
    if (prefix) console.log("  npm global bin   " + pc.cyan(prefix) + pc.dim(" — add this directory to user PATH, then reopen PowerShell"));
  }

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

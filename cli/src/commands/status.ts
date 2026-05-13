import pc from "picocolors";
import { loadConfig, configPath } from "../config.js";
import { fetchRankChecked } from "../api.js";
import { adapters, totalTokens } from "../adapters/index.js";
import { formatTokens } from "../format.js";
import { getClaudeHookStatus } from "./install.js";

function formatAdapterStatus(label: string, detected: boolean, note?: string): string {
  const state = detected ? pc.green("detected") : pc.dim("not detected");
  return `  ${label.padEnd(18)}${state}${note ? pc.dim(` · ${note}`) : ""}`;
}

export async function status(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  const results = adapters.map((adapter) => ({
    adapter,
    result: adapter.scan(),
  }));
  const hook = getClaudeHookStatus();

  console.log();
  console.log(pc.bold("burnlog") + pc.dim(" · status"));
  console.log();
  console.log("  config file      " + pc.dim(configPath()));
  console.log("  api url          " + pc.cyan(cfg.apiUrl));
  console.log("  api key          " + (cfg.apiKey ? pc.green("present") : pc.red("missing")));
  console.log("  claude dir       " + pc.dim(cfg.claudeProjectsDir ?? ""));
  console.log("  last sync        " + (cfg.lastSync ? pc.cyan(cfg.lastSync) : pc.dim("never")));

  console.log();
  console.log(pc.bold("integrations"));
  for (const { adapter, result } of results) {
    const note =
      result.events.length > 0
        ? `${result.events.length} events · ${result.scannedFiles} files · ${formatTokens(result.events.reduce((sum, event) => sum + totalTokens(event), 0))}`
        : result.note;
    console.log(formatAdapterStatus(adapter.name, adapter.detect(), note));
  }

  const hookState = hook.error
    ? pc.yellow("unreadable")
    : hook.installed
      ? pc.green("installed")
      : hook.exists
        ? pc.yellow("not installed")
        : pc.dim("settings file missing");
  console.log(`  ${"claude hook".padEnd(18)}${hookState}${hook.error ? pc.dim(` · ${hook.error}`) : ""}`);
  console.log("  " + pc.dim(hook.path));

  if (cfg.apiKey) {
    process.stdout.write(pc.dim("\n  validating api key... "));
    const auth = await fetchRankChecked(cfg.apiUrl, cfg.apiKey);
    if (auth.ok) {
      process.stdout.write(pc.green("ok\n\n"));
      const rank = auth.rank;
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
      const detail = auth.kind === "invalid_key"
        ? pc.red("invalid key")
        : auth.kind === "unreachable"
          ? pc.yellow("unreachable api")
          : pc.yellow(`${auth.kind.replaceAll("_", " ")}${auth.status ? ` (${auth.status})` : ""}`);
      process.stdout.write(detail + "\n");
      console.log("  " + pc.dim(auth.message));
    }
  } else {
    console.log();
    console.log(pc.dim("  run ") + pc.bold("burnlog login <key>") + pc.dim(" to get started"));
    console.log(pc.dim("  grab a key from ") + pc.cyan(`${cfg.apiUrl}/settings`));
  }
  console.log();
}

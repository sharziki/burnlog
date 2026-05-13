import pc from "picocolors";
import { loadConfig, saveConfig, configPath } from "../config.js";
import { fetchRankChecked } from "../api.js";

export async function login(args: string[]): Promise<void> {
  const key = args[0];
  const cfg = loadConfig();

  if (!key) {
    console.error(pc.red("usage: burnlog login <api-key>"));
    console.error("grab a key from " + pc.cyan(`${cfg.apiUrl}/settings`));
    process.exit(1);
  }

  process.stdout.write(pc.dim("validating api key... "));
  const result = await fetchRankChecked(cfg.apiUrl, key);
  if (!result.ok) {
    process.stdout.write(pc.red("fail\n"));
    if (result.kind === "invalid_key") {
      console.error(pc.red("invalid api key") + pc.dim(` · ${result.message}`));
    } else if (result.kind === "unreachable") {
      console.error(pc.red("could not reach burnlog api") + pc.dim(` · ${result.message}`));
    } else {
      const status = result.status ? ` ${result.status}` : "";
      console.error(pc.red(`api validation failed${status}`) + pc.dim(` · ${result.message}`));
    }
    console.error("check " + pc.cyan(cfg.apiUrl) + " and try again");
    process.exit(1);
  }

  process.stdout.write(pc.green("ok\n"));
  cfg.apiKey = key;
  saveConfig(cfg);
  console.log(pc.green("✓") + " saved api key to " + pc.dim(configPath()));
  console.log("  api url: " + pc.cyan(cfg.apiUrl));

  const rank = result.rank;
  console.log(
    "  logged in as " +
      pc.bold(`@${rank.username}`) +
      pc.dim(" · ") +
      pc.yellow(`${rank.rankIcon} ${rank.rank}`),
  );
  console.log();
  console.log(pc.dim("next:"));
  console.log("  " + pc.bold("burnlog sync") + pc.dim("     upload your existing burn history"));
  console.log("  " + pc.bold("burnlog install") + pc.dim("  install Claude Code auto-sync hook"));
}

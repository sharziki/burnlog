import pc from "picocolors";
import { loadConfig, configPath } from "../config.js";

export function status(_args: string[]): void {
  const cfg = loadConfig();
  console.log();
  console.log(pc.bold("burnlog") + pc.dim(" · config"));
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
  console.log();
}

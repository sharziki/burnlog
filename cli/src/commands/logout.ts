import pc from "picocolors";
import { loadConfig, saveConfig, configPath } from "../config.js";

export function logout(_args: string[]): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.log(pc.yellow("no api key stored — nothing to log out of"));
    return;
  }
  delete cfg.apiKey;
  delete cfg.lastSync;
  saveConfig(cfg);
  console.log(pc.green("✓") + " cleared api key from " + pc.dim(configPath()));
}

import pc from "picocolors";
import { loadConfig, saveConfig, configPath } from "../config.js";

export function login(args: string[]): void {
  const key = args[0];
  if (!key) {
    console.error(pc.red("usage: burnlog login <api-key>"));
    console.error("grab a key from " + pc.cyan("http://localhost:3000/settings"));
    process.exit(1);
  }
  const cfg = loadConfig();
  cfg.apiKey = key;
  saveConfig(cfg);
  console.log(pc.green("✓") + " saved api key to " + pc.dim(configPath()));
  console.log("  api url: " + pc.cyan(cfg.apiUrl));
  console.log("  run " + pc.bold("burnlog sync") + " to upload your burn history");
}

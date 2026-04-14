import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type Config = {
  apiUrl: string;
  apiKey?: string;
  lastSync?: string;
  claudeProjectsDir?: string;
};

const CONFIG_DIR = join(homedir(), ".burnlog");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS: Config = {
  apiUrl: process.env.BURNLOG_API_URL ?? "http://localhost:3000",
  claudeProjectsDir: join(homedir(), ".claude", "projects"),
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Config>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function configPath(): string {
  return CONFIG_PATH;
}

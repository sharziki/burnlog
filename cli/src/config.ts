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

const DEFAULT_API_URL = "https://burnlog.net";

const DEFAULTS: Config = {
  apiUrl: process.env.BURNLOG_API_URL ?? DEFAULT_API_URL,
  claudeProjectsDir: join(homedir(), ".claude", "projects"),
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Config>) };
    // BURNLOG_API_URL env always wins over stored value.
    if (process.env.BURNLOG_API_URL) parsed.apiUrl = process.env.BURNLOG_API_URL;
    return parsed;
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

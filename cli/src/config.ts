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

/**
 * Hosts this CLI used to point at that no longer resolve.
 *
 * The default moving is not enough on its own: `loadConfig()` overlays the
 * stored file over the defaults, so anyone who ran an older build has the dead
 * host written into `~/.burnlog/config.json` and keeps using it forever. The
 * only way those installs recover without the user editing JSON by hand is to
 * treat a stored dead host as absent.
 */
const RETIRED_API_URLS = new Set(["https://burnlog.sxna.dev"]);

const DEFAULTS: Config = {
  apiUrl: process.env.BURNLOG_API_URL ?? DEFAULT_API_URL,
  claudeProjectsDir: join(homedir(), ".claude", "projects"),
};

/**
 * Which fields the environment overrode on the last load.
 *
 * Without this, a one-off `BURNLOG_API_URL=... burnlog sync` permanently
 * rewrites the stored url: loadConfig() overlays the env value, then any
 * command that calls saveConfig() (sync writes `lastSync`) persists the whole
 * object including the override. An env var is meant to be temporary, so it
 * must never survive into the file.
 */
const envOverrides = new Set<keyof Config>();

export function loadConfig(): Config {
  envOverrides.clear();
  const applyEnv = (cfg: Config): Config => {
    if (process.env.BURNLOG_API_URL) {
      cfg.apiUrl = process.env.BURNLOG_API_URL;
      envOverrides.add("apiUrl");
    }
    if (process.env.BURNLOG_API_KEY) {
      cfg.apiKey = process.env.BURNLOG_API_KEY;
      envOverrides.add("apiKey");
    }
    return cfg;
  };

  if (!existsSync(CONFIG_PATH)) return applyEnv({ ...DEFAULTS });
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const stored = JSON.parse(raw) as Partial<Config>;
    if (stored.apiUrl && RETIRED_API_URLS.has(stored.apiUrl.replace(/\/+$/, ""))) {
      delete stored.apiUrl;
    }
    return applyEnv({ ...DEFAULTS, ...stored });
  } catch {
    return applyEnv({ ...DEFAULTS });
  }
}

export function saveConfig(cfg: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  // Start from what's on disk so env-derived values are never persisted.
  let stored: Partial<Config> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      stored = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
    } catch {
      stored = {};
    }
  }

  const next: Partial<Config> = { ...cfg };
  for (const key of envOverrides) {
    if (key in stored) next[key] = stored[key] as never;
    else delete next[key];
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** Explicit writes (login/logout) must win over the env-override guard. */
export function saveConfigField<K extends keyof Config>(key: K, value: Config[K]): void {
  const cfg = loadConfig();
  // Clear *after* loading — loadConfig() rebuilds the override set.
  envOverrides.delete(key);
  cfg[key] = value;
  saveConfig(cfg);
}

export function configPath(): string {
  return CONFIG_PATH;
}

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { envDir, hashId, num } from "./fileutil.js";

/**
 * Trae adapter — ported from tokscale's `sessions/trae.rs`.
 *
 * Trae keeps no usable local log. tokscale fetches its usage API (with the
 * user's Trae credentials) and dumps the raw responses as JSON arrays into
 * its own config dir:
 *
 *   <tokscale config>/trae-cache/sessions/*.json
 *     tokscale config = $TOKSCALE_CONFIG_DIR, else
 *                       Linux:   $XDG_CONFIG_HOME/tokscale or ~/.config/tokscale
 *                       Windows: %APPDATA%\tokscale
 *                       macOS:   ~/.config/tokscale
 *
 * burnlog does not make that network call itself; it only reads a cache
 * tokscale already wrote. Each array element is one billed session:
 *
 *   { session_id, usage_time (epoch s), model_name, mode,
 *     extra_info: { input_token, output_token, cache_read_token, cache_write_token } }
 *
 * The API reports exact, separate buckets (input excludes cache). Auto-mode
 * sessions have an empty model_name and are bucketed as `trae-<mode>`.
 * Records without a session_id or a positive usage_time are dropped, and the
 * dedupe key is (session_id, usage_time) — hashed, as in tokscale.
 *
 * Override the cache dir with BURNLOG_TRAE_DIR.
 */

const MODEL_MAP: Record<string, string> = {
  "GPT-5.4": "gpt-5.4",
  "GPT-5.3-Codex": "gpt-5.3-codex",
  "GPT-5.3 Codex": "gpt-5.3-codex",
  "GPT-5.3": "gpt-5.3",
  "GPT-5.2-Codex": "gpt-5.2-codex",
  "GPT-5.2 Codex": "gpt-5.2-codex",
  "GPT-5.2": "gpt-5.2",
  "GPT-5.1-Codex": "gpt-5.1-codex",
  "GPT-5.1 Codex": "gpt-5.1-codex",
  "GPT-5.1": "gpt-5.1",
  "Gemini 3.1 Pro": "gemini-3.1-pro",
  "Gemini 3.1": "gemini-3.1",
  "GLM 5.1": "glm-5.1",
  "GLM-5.1": "glm-5.1",
  "Claude Sonnet 4.6": "claude-sonnet-4.6",
  "Claude-Sonnet-4.6": "claude-sonnet-4.6",
  "Claude Sonnet 4.5": "claude-sonnet-4.5",
  "Claude-Sonnet-4.5": "claude-sonnet-4.5",
};

export function normalizeTraeModel(name: string): string {
  return MODEL_MAP[name] ?? name;
}

export function traeProvider(model: string): BurnEvent["provider"] {
  if (model.includes("GPT") || model.includes("gpt")) return "openai";
  if (model.includes("Claude") || model.includes("claude")) return "anthropic";
  if (model.includes("Gemini") || model.includes("gemini")) return "google";
  return "other";
}

function tokscaleConfigDir(): string {
  const custom = envDir("TOKSCALE_CONFIG_DIR");
  if (custom) return custom;
  const home = homedir();
  if (process.platform === "linux") {
    const xdg = envDir("XDG_CONFIG_HOME");
    if (xdg) return join(xdg, "tokscale");
  }
  if (process.platform === "win32") {
    return join(envDir("APPDATA") ?? join(home, "AppData", "Roaming"), "tokscale");
  }
  return join(home, ".config", "tokscale");
}

export class TraeAdapter implements Adapter {
  readonly name = "trae" as const;

  private get root(): string {
    return envDir("BURNLOG_TRAE_DIR") ?? join(tokscaleConfigDir(), "trae-cache", "sessions");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    if (!this.detect()) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "no Trae usage cache (Trae keeps usage server-side; run `tokscale` once to fetch it)",
      };
    }

    let files: string[] = [];
    try {
      files = readdirSync(this.root).filter((f) => f.endsWith(".json"));
    } catch {
      /* unreadable */
    }

    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const f of files) {
      const full = join(this.root, f);
      let raw: string;
      try {
        if (!statSync(full).isFile() || !shouldRead(statSync(full).mtimeMs, opts.since)) continue;
        raw = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;
      let arr: unknown;
      try {
        arr = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;

      for (const s of arr as Array<Record<string, any>>) {
        totalLines++;
        if (!s || typeof s !== "object") continue;
        const sessionId = typeof s.session_id === "string" ? s.session_id : "";
        const usageTime = s.usage_time;
        if (!sessionId || typeof usageTime !== "number" || !Number.isInteger(usageTime) || usageTime <= 0) continue;
        const ms = usageTime * 1000;
        // tokscale rejects i64 overflow; reject anything that is not a real date.
        if (!Number.isSafeInteger(ms) || !Number.isFinite(new Date(ms).getTime())) continue;

        const rawModel = typeof s.model_name === "string" ? s.model_name : "";
        const mode = typeof s.mode === "string" ? s.mode : "";
        const model = rawModel
          ? normalizeTraeModel(rawModel)
          : mode
            ? `trae-${mode.toLowerCase()}`
            : "trae-unknown";

        const x = s.extra_info ?? {};
        const input = num(x.input_token);
        const output = num(x.output_token);
        const cacheRead = num(x.cache_read_token);
        const cacheWrite = num(x.cache_write_token);
        if (input + output + cacheRead + cacheWrite === 0) continue;

        const id = hashId(`trae:${sessionId}:${usageTime}`);
        if (byKey.has(id)) continue;
        byKey.set(id, {
          requestId: id,
          source: this.name,
          model,
          provider: traeProvider(model),
          inputTokens: input,
          outputTokens: output,
          cacheCreationTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          timestamp: new Date(ms).toISOString(),
        });
      }
    }

    return { source: this.name, events: [...byKey.values()], scannedFiles, totalLines };
  }
}

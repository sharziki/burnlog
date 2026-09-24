import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, walkFiles } from "./fileutil.js";

/**
 * Mux (coder/mux) — ported from tokscale's `sessions/mux.rs`.
 *
 * Mux keeps one cumulative usage file per workspace:
 *
 *   ~/.mux/sessions/<workspaceId>/session-usage.json
 *
 *   { byModel: { "<provider>:<model>": { input, cached, cacheCreate, output,
 *                                        reasoning: { tokens, cost_usd } } },
 *     lastRequest: { model, timestamp (epoch ms) } }
 *
 * The buckets are disjoint (input excludes cache). One event per
 * (workspace, model), keyed by a hash of both — the file is rewritten in
 * place as the workspace grows, so the same id carries the newer total on
 * the next sync, like the Codex adapter's per-file totals. The timestamp is
 * `lastRequest.timestamp`, else the file's mtime (same as tokscale).
 *
 * Same path on every OS (tokscale's `Home` root). Override the sessions dir
 * with BURNLOG_MUX_DIR.
 */

type Bucket = { tokens?: unknown };
type ModelUsage = {
  input?: Bucket;
  cached?: Bucket;
  cacheCreate?: Bucket;
  output?: Bucket;
  reasoning?: Bucket;
};
type SessionUsage = {
  byModel?: Record<string, ModelUsage> | null;
  lastRequest?: { timestamp?: unknown } | null;
};

function sessionsRoot(): string {
  return envDir("BURNLOG_MUX_DIR") ?? join(homedir(), ".mux", "sessions");
}

/** Integer tokens clamped at 0 (tokscale: `.max(0)` on an i64). */
function tokens(b: Bucket | undefined): number {
  const v = b?.tokens;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export class MuxAdapter implements Adapter {
  readonly name = "mux" as const;

  detect(): boolean {
    return existsSync(sessionsRoot());
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = sessionsRoot();
    if (!existsSync(root)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = walkFiles(root, (n) => n === "session-usage.json");
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;

    for (const file of files) {
      let raw: string;
      let mtimeMs: number;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        raw = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;

      let usage: SessionUsage;
      try {
        usage = JSON.parse(raw) as SessionUsage;
      } catch {
        continue;
      }
      if (!usage || typeof usage !== "object" || !usage.byModel || typeof usage.byModel !== "object") continue;

      const ts = usage.lastRequest?.timestamp;
      const timestamp =
        typeof ts === "number" && Number.isInteger(ts) ? new Date(ts) : new Date(mtimeMs);
      if (Number.isNaN(timestamp.getTime())) continue;
      const workspaceId = basename(dirname(file));

      for (const [modelKey, m] of Object.entries(usage.byModel)) {
        if (!m || typeof m !== "object") continue;
        const input = tokens(m.input);
        const cached = tokens(m.cached);
        const cacheCreate = tokens(m.cacheCreate);
        const output = tokens(m.output);
        const reasoning = tokens(m.reasoning);
        if (input + cached + cacheCreate + output + reasoning === 0) continue;

        // "anthropic:claude-opus-4-6" -> provider "anthropic", model "claude-opus-4-6".
        const colon = modelKey.indexOf(":");
        const providerId = colon >= 0 ? modelKey.slice(0, colon).toLowerCase() : "";
        const model = colon >= 0 ? modelKey.slice(colon + 1) : modelKey;

        const requestId = hashId("mux", workspaceId, modelKey);
        byId.set(requestId, {
          requestId,
          source: this.name,
          model,
          provider:
            providerId === "anthropic" || providerId === "openai" || providerId === "google"
              ? providerId
              : providerFromModel(model),
          inputTokens: input,
          outputTokens: output + reasoning,
          cacheCreationTokens: cacheCreate,
          cacheReadTokens: cached,
          timestamp: timestamp.toISOString(),
        });
      }
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

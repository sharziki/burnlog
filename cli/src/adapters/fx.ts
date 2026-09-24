import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, walkFiles } from "./fileutil.js";

/**
 * fx (vercel-labs/fx) — ported from tokscale's `sessions/fx.rs`.
 *
 * fx aggregates usage into one snapshot per session:
 *
 *   ~/.fx/sessions/<sessionId>/usage-v2.json
 *     { session_id, snapshot: { input_tokens, output_tokens, cache_read_tokens,
 *       cache_write_tokens, reasoning_tokens, request_count,
 *       models: [{ model: "zai/glm-5.2", input_tokens, ... }] } }
 *
 * One event per (session, model). When no per-model entry has tokens, the
 * top-level session aggregates are attributed to a synthetic `fx-unknown`
 * model instead of being dropped (tokscale does the same). The timestamp is
 * the sibling `session.json`'s `updated_at_ms`/`created_at_ms`, falling back
 * to the usage file's mtime. That sibling also holds `workspace_root`, and
 * `sessions/index.json` holds titles: neither is read beyond the timestamp.
 *
 * Buckets are disjoint; reasoning is its own field and is added to output.
 * The global `~/.fx/usage.jsonl` stream is deliberately not scanned (tokscale
 * skips it too — it has no session id to dedupe against the snapshots).
 *
 * Same path on every OS. Override the sessions dir with BURNLOG_FX_DIR.
 */

const UNKNOWN_MODEL = "fx-unknown";

type Counts = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_tokens?: unknown;
  cache_write_tokens?: unknown;
  reasoning_tokens?: unknown;
};
type ModelUsage = Counts & { model?: unknown };
type UsageFile = {
  session_id?: unknown;
  snapshot?: (Counts & { models?: unknown }) | null;
};

function sessionsRoot(): string {
  return envDir("BURNLOG_FX_DIR") ?? join(homedir(), ".fx", "sessions");
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function buckets(c: Counts) {
  return {
    input: n(c.input_tokens),
    output: n(c.output_tokens),
    cacheRead: n(c.cache_read_tokens),
    cacheWrite: n(c.cache_write_tokens),
    reasoning: n(c.reasoning_tokens),
  };
}

function metaTimestamp(file: string): number | undefined {
  try {
    const meta = JSON.parse(readFileSync(join(dirname(file), "session.json"), "utf8")) as {
      updated_at_ms?: unknown;
      created_at_ms?: unknown;
    };
    const t = meta.updated_at_ms ?? meta.created_at_ms;
    return typeof t === "number" && Number.isInteger(t) ? t : undefined;
  } catch {
    return undefined;
  }
}

/** `zai/glm-5.2` -> ["zai", "glm-5.2"]; unprefixed ids stay whole. */
function splitModel(raw: string): [string | undefined, string] {
  const i = raw.indexOf("/");
  if (i > 0 && i < raw.length - 1) return [raw.slice(0, i), raw.slice(i + 1)];
  return [undefined, raw];
}

export class FxAdapter implements Adapter {
  readonly name = "fx" as const;

  detect(): boolean {
    return existsSync(sessionsRoot());
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = sessionsRoot();
    if (!existsSync(root)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = walkFiles(root, (name) => name === "usage-v2.json");
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

      let parsed: UsageFile;
      try {
        parsed = JSON.parse(raw) as UsageFile;
      } catch {
        continue;
      }
      const snapshot = parsed?.snapshot;
      if (!snapshot || typeof snapshot !== "object") continue;

      const sessionId =
        typeof parsed.session_id === "string" && parsed.session_id ? parsed.session_id : basename(dirname(file));
      const timestamp = new Date(metaTimestamp(file) ?? mtimeMs).toISOString();

      const emitted: BurnEvent[] = [];
      const push = (model: string, providerId: string | undefined, b: ReturnType<typeof buckets>) => {
        const p = providerId?.toLowerCase();
        emitted.push({
          requestId: hashId("fx", sessionId, model),
          source: this.name,
          model,
          provider: p === "anthropic" || p === "openai" || p === "google" ? p : providerFromModel(model),
          inputTokens: b.input,
          outputTokens: b.output + b.reasoning,
          cacheCreationTokens: b.cacheWrite,
          cacheReadTokens: b.cacheRead,
          timestamp,
        });
      };

      const models = Array.isArray(snapshot.models) ? (snapshot.models as ModelUsage[]) : [];
      for (const m of models) {
        if (!m || typeof m !== "object") continue;
        const b = buckets(m);
        if (b.input + b.output + b.cacheRead + b.cacheWrite + b.reasoning === 0) continue;
        const rawModel = typeof m.model === "string" ? m.model : UNKNOWN_MODEL;
        const [providerId, model] = splitModel(rawModel);
        push(model, providerId, b);
      }

      if (emitted.length === 0) {
        const b = buckets(snapshot);
        if (b.input + b.output + b.cacheRead + b.cacheWrite + b.reasoning > 0) push(UNKNOWN_MODEL, undefined, b);
      }

      for (const e of emitted) byId.set(e.requestId, e);
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

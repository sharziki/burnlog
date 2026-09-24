import { readFileSync, statSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, envOrHome, isDir, num, walkFiles } from "./fileutil.js";

/**
 * Hindsight adapter — the self-hosted agent-memory service's LLM usage.
 *
 * Hindsight keeps no session logs of its own; its trace table is a rolling
 * window exposed over HTTP. tokscale's `tokscale hindsight sync` mirrors it
 * into an append-only monthly ledger, which is what this reads:
 *
 *   ~/.hindsight/usage/<YYYY-MM>.jsonl        ($HINDSIGHT_HOME honoured)
 *
 * One JSON row per successful call (ported from tokscale
 * `sessions/hindsight.rs`):
 *   { id, model, provider, started_at (RFC 3339), input_tokens,
 *     output_tokens, cached_tokens, total_tokens, ... }
 *
 * `cached_tokens` is its own bucket, never folded into input (it is null on
 * every provider observed so far). Reasoning is already inside
 * `output_tokens`. Rows with a non-positive stated total, no usage, or an
 * unparseable `started_at` are skipped. The `bank`, `operation` and `scope`
 * labels are never read into an event.
 *
 * So this only finds data where the ledger has been synced (by tokscale).
 *
 * Override the Hindsight home with BURNLOG_HINDSIGHT_DIR (or HINDSIGHT_HOME).
 */

function hindsightHome(): string {
  return envDir("BURNLOG_HINDSIGHT_DIR") ?? envOrHome("HINDSIGHT_HOME", ".hindsight");
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

export function parseHindsightLine(line: string): BurnEvent | null {
  const s = line.trim();
  if (!s) return null;
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!r || typeof r !== "object" || typeof r.id !== "string") return null;
  if (typeof r.total_tokens === "number" && r.total_tokens <= 0) return null;
  const started = typeof r.started_at === "string" ? r.started_at : "";
  if (!RFC3339.test(started)) return null;
  const ts = Date.parse(started);
  if (!Number.isFinite(ts)) return null;
  const input = num(r.input_tokens);
  const output = num(r.output_tokens);
  if (input === 0 && output === 0) return null;
  const model = typeof r.model === "string" && r.model ? r.model : "unknown";
  return {
    requestId: `hindsight:${r.id}`,
    source: "hindsight",
    model,
    provider: providerFromModel(model),
    inputTokens: input,
    outputTokens: output,
    cacheCreationTokens: 0,
    cacheReadTokens: num(r.cached_tokens),
    timestamp: new Date(ts).toISOString(),
  };
}

export class HindsightAdapter implements Adapter {
  readonly name = "hindsight" as const;

  private get usageDir(): string {
    return join(hindsightHome(), "usage");
  }

  detect(): boolean {
    return isDir(this.usageDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const dir = this.usageDir;
    if (!isDir(dir)) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "not installed (the usage ledger is written by `tokscale hindsight sync`)",
      };
    }
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    for (const file of walkFiles(dir, (n) => n.endsWith(".jsonl"))) {
      let raw: string;
      try {
        if (!shouldRead(statSync(file).mtimeMs, opts.since)) continue;
        raw = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;
      for (const line of raw.split("\n")) {
        totalLines++;
        const e = parseHindsightLine(line);
        if (e && !byId.has(e.requestId)) byId.set(e.requestId, e);
      }
    }
    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines };
  }
}

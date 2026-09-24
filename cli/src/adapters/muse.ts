import { readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, isDir, walkFiles, xdgData } from "./fileutil.js";

/**
 * Muse Code (Meta) adapter.
 *
 * Muse writes one event-sourced transcript per session, under an XDG-style
 * data dir on every platform (Windows included):
 *
 *   ~/.local/share/muse/sessions/YYYY/MM/DD/<session-uuid>/session.jsonl
 *   .../<session-uuid>/subagent/<child-uuid>/session.jsonl
 *
 * Only `payload.event.kind == "model_completed"` records carry usage (ported
 * from tokscale `sessions/muse.rs`):
 *
 *   {"sequence": 39, "recorded_at": 1789790455896395,       // microseconds
 *    "payload": {"event": {"kind": "model_completed", "model": "...",
 *      "duration_ms": 5819, "usage": {"input_tokens", "output_tokens",
 *      "cached_tokens" | "cache_read_tokens", "cache_write_tokens",
 *      "reasoning_tokens"}}}}
 *
 * The parent's `workflow_child_lifecycle` usage aggregates duplicate the
 * subagent transcripts (which are scanned on their own) and are ignored.
 *
 * Tokens: cached tokens are a SUBSET of input_tokens, so fresh input is
 * input − cache read. Reasoning rides inside output_tokens and is kept there.
 * `recorded_at` marks the call's end; the event is dated at end − duration.
 * Lines are pre-filtered on the literal "model_completed" so transcript text
 * is never JSON-parsed unless it could be a usage record.
 *
 * Override the Muse data dir (the one holding `sessions/`) with
 * BURNLOG_MUSE_DIR.
 */

function museRoot(): string {
  return envDir("BURNLOG_MUSE_DIR") ?? join(xdgData(), "muse");
}

type J = Record<string, unknown>;

function obj(v: unknown): J | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as J) : undefined;
}

/** tokscale's `number_value`: numbers or numeric strings, clamped at 0. */
function numVal(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : undefined;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : undefined;
  }
  return undefined;
}

function firstNum(o: J, ...keys: string[]): number {
  for (const k of keys) {
    const v = numVal(o[k]);
    if (v !== undefined) return v;
  }
  return 0;
}

/** Microseconds (current), milliseconds or seconds → ms. */
export function recordedAtToMs(raw: number): number | undefined {
  if (raw >= 1e15) return Math.floor(raw / 1000);
  if (raw >= 1e12) return raw;
  if (raw >= 1e9) return raw * 1000;
  return undefined;
}

export function parseMuseFile(path: string): BurnEvent[] {
  let raw: string;
  let mtime: number;
  try {
    raw = readFileSync(path, "utf8");
    mtime = statSync(path).mtimeMs;
  } catch {
    return [];
  }
  const pathSession = basename(dirname(path)).trim() || "unknown";
  const out: BurnEvent[] = [];
  const seen = new Set<string>();
  const lines = raw.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.includes("model_completed")) continue;
    let rec: J | undefined;
    try {
      rec = obj(JSON.parse(line));
    } catch {
      continue;
    }
    const event = obj(obj(rec?.payload)?.event);
    if (!rec || !event || event.kind !== "model_completed") continue;
    const usage = obj(event.usage);
    const model = typeof event.model === "string" ? event.model.trim() : "";
    if (!usage || !model) continue;

    const recorded = numVal(rec.recorded_at);
    const end = recorded !== undefined ? recordedAtToMs(recorded) : undefined;
    const duration = numVal(event.duration_ms);
    let ts = end ?? mtime;
    if (end !== undefined && duration && duration > 0 && end - duration > 0) ts = end - duration;

    const input = firstNum(usage, "input_tokens");
    const output = firstNum(usage, "output_tokens");
    const cacheRead = Math.min(firstNum(usage, "cache_read_tokens", "cached_tokens"), input);
    const cacheWrite = firstNum(usage, "cache_write_tokens");
    if (input + output + cacheWrite === 0) continue;

    const ordinal = numVal(rec.sequence) ?? index;
    const streamId = obj(rec.stream)?.id;
    const session = typeof streamId === "string" && streamId.trim() ? streamId.trim() : pathSession;
    // A replayed identical event reproduces the same key and collapses.
    const requestId = `muse:${hashId(session, ordinal, model, input, output, cacheRead, cacheWrite)}`;
    if (seen.has(requestId)) continue;
    seen.add(requestId);

    out.push({
      requestId,
      source: "muse",
      model,
      provider: providerFromModel(model),
      inputTokens: input - cacheRead,
      outputTokens: output,
      cacheCreationTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      timestamp: new Date(ts).toISOString(),
    });
  }
  return out;
}

export class MuseAdapter implements Adapter {
  readonly name = "muse" as const;

  private get sessionsDir(): string {
    return join(museRoot(), "sessions");
  }

  detect(): boolean {
    return isDir(this.sessionsDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const dir = this.sessionsDir;
    if (!isDir(dir)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    for (const file of walkFiles(dir, (n) => n === "session.jsonl")) {
      try {
        if (!shouldRead(statSync(file).mtimeMs, opts.since)) continue;
      } catch {
        continue;
      }
      scannedFiles++;
      for (const e of parseMuseFile(file)) if (!byId.has(e.requestId)) byId.set(e.requestId, e);
    }
    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: byId.size };
  }
}

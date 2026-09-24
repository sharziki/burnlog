import * as zlib from "zlib";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead, splitOversized } from "./types.js";
import { querySqlite, SqliteUnavailable } from "./sqlite.js";
import { envDir, hashId, num, toMs, xdgData } from "./fileutil.js";
import { dbMtime } from "./antigravity-cli.js";

/**
 * Zed Agent adapter — ported from tokscale's `sessions/zed.rs` (MIT).
 *
 * Zed keeps every agent thread as one row of `threads` in:
 *
 *   Linux/BSD  $XDG_DATA_HOME/zed/threads/threads.db (~/.local/share/...)
 *   macOS      ~/Library/Application Support/Zed/threads/threads.db
 *   Windows    %LOCALAPPDATA%\Zed\threads\threads.db
 *
 * `data` is the serialized thread, either plain JSON or zstd-compressed JSON
 * (`data_type` says which). It is decoded in memory only to read
 * `model.{provider,model}`, `request_token_usage` (per-request usage, summed)
 * or, failing that, `cumulative_token_usage`; nothing else leaves this file.
 *
 * Only Zed-hosted rows (`model.provider == "zed.dev"`) count: threads run on
 * an external ACP agent or a user's own API key are billed and logged by that
 * provider/CLI, and counting them here would double count. Imported threads are
 * skipped for the same reason.
 *
 * One event per thread (tokscale's grain), keyed by a hash of the thread id,
 * dated at the thread's created_at (falling back to updated_at). A thread
 * that grows re-emits the same id with larger totals.
 *
 * zstd needs Node 22.15+ / 23.8+ (`zlib.zstdDecompressSync`); on older Node
 * compressed threads are skipped and the note says so.
 *
 * Override the directory holding threads.db with BURNLOG_ZED_DIR.
 */

const HOSTED = "zed.dev";
const MAX_JSON_BYTES = 32 * 1024 * 1024;

type Json = Record<string, unknown>;

function candidateDbs(): string[] {
  const explicit = envDir("BURNLOG_ZED_DIR");
  if (explicit) return [join(explicit, "threads.db"), join(explicit, "threads", "threads.db")];
  const home = homedir();
  return [
    join(xdgData(), "zed", "threads", "threads.db"),
    join(home, "Library", "Application Support", "Zed", "threads", "threads.db"),
    join(envDir("LOCALAPPDATA") ?? join(home, "AppData", "Local"), "Zed", "threads", "threads.db"),
  ];
}

type ZstdDecompress = (buf: Buffer, opts?: { maxOutputLength?: number }) => Buffer;
const zstd = (zlib as unknown as { zstdDecompressSync?: ZstdDecompress }).zstdDecompressSync;

class NoZstd extends Error {}

/** Decode a thread payload, or null when it is not one we can read. */
export function decodeThread(dataType: string, data: Buffer): Json | null {
  let json: Buffer;
  switch (dataType.trim().toLowerCase()) {
    case "json":
      if (data.length > MAX_JSON_BYTES) return null;
      json = data;
      break;
    case "zstd":
      if (!zstd) throw new NoZstd();
      try {
        json = zstd(data, { maxOutputLength: MAX_JSON_BYTES });
      } catch {
        return null; // corrupt, or over the size cap
      }
      break;
    default:
      return null;
  }
  try {
    const v = JSON.parse(json.toString("utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

function usageOf(v: unknown): Usage {
  const o = (v && typeof v === "object" ? v : {}) as Json;
  // Zed's TokenUsage has no reasoning field; output is all there is.
  return {
    input: num(o.input_tokens),
    output: num(o.output_tokens),
    cacheRead: num(o.cache_read_input_tokens),
    cacheWrite: num(o.cache_creation_input_tokens),
  };
}

const total = (u: Usage): number => u.input + u.output + u.cacheRead + u.cacheWrite;

/** Per-request usage summed when present, else the thread's cumulative usage. */
export function threadUsage(thread: Json): Usage | null {
  const req = thread.request_token_usage;
  const values = Array.isArray(req) ? req : req && typeof req === "object" ? Object.values(req) : [];
  const sum: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const v of values) {
    const u = usageOf(v);
    if (total(u) <= 0) continue;
    sum.input += u.input;
    sum.output += u.output;
    sum.cacheRead += u.cacheRead;
    sum.cacheWrite += u.cacheWrite;
  }
  if (total(sum) > 0) return sum;
  if (thread.cumulative_token_usage === undefined) return null;
  const cum = usageOf(thread.cumulative_token_usage);
  return total(cum) > 0 ? cum : null;
}

export class ZedAdapter implements Adapter {
  readonly name = "zed" as const;

  private get dbPath(): string | null {
    return candidateDbs().find((p) => existsSync(p)) ?? null;
  }

  detect(): boolean {
    return this.dbPath !== null;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = this.dbPath;
    if (!db) return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    if (!shouldRead(dbMtime(db), opts.since)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0 };
    }

    let rows: Record<string, unknown>[];
    try {
      const cols = new Set((await querySqlite(db, "PRAGMA table_info(threads)")).map((r) => String(r.name)));
      if (!cols.has("data")) {
        return { source: this.name, events: [], scannedFiles: 1, totalLines: 0, note: "threads.db has no threads table yet" };
      }
      const createdAt = cols.has("created_at") ? "created_at" : "NULL";
      // hex() keeps the blob intact through both node:sqlite and the sqlite3
      // CLI fallback. No summary, title or folder columns are selected.
      rows = await querySqlite(
        db,
        `SELECT id, updated_at, ${createdAt} AS created_at, data_type, hex(data) AS data_hex FROM threads`,
      );
    } catch (err) {
      const note =
        err instanceof SqliteUnavailable ? `detected, but ${err.message}` : "detected, but threads.db is unreadable";
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note };
    }

    const events: BurnEvent[] = [];
    let skippedZstd = 0;
    for (const row of rows) {
      const id = row.id == null ? "" : String(row.id);
      if (!id || typeof row.data_hex !== "string") continue;

      let thread: Json | null;
      try {
        thread = decodeThread(String(row.data_type ?? ""), Buffer.from(row.data_hex, "hex"));
      } catch (err) {
        if (err instanceof NoZstd) {
          skippedZstd++;
          continue;
        }
        throw err;
      }
      if (!thread || thread.imported === true) continue;

      const m = (thread.model && typeof thread.model === "object" ? thread.model : {}) as Json;
      const provider = typeof m.provider === "string" ? m.provider.trim() : "";
      if (provider.toLowerCase() !== HOSTED) continue;
      const model = typeof m.model === "string" ? m.model.trim() : "";
      if (!model) continue;

      const usage = threadUsage(thread);
      if (!usage) continue;
      const ts = toMs(row.created_at) ?? toMs(row.updated_at) ?? toMs(thread.updated_at);
      if (ts === undefined) continue;

      // A whole thread is one aggregate; split it if it outgrows INT4.
      events.push(...splitOversized({
        requestId: hashId("zed", id),
        source: this.name,
        model,
        provider: providerFromModel(model),
        inputTokens: usage.input,
        outputTokens: usage.output,
        cacheCreationTokens: usage.cacheWrite,
        cacheReadTokens: usage.cacheRead,
        timestamp: new Date(ts).toISOString(),
      }));
    }

    return {
      source: this.name,
      events,
      scannedFiles: 1,
      totalLines: rows.length,
      ...(skippedZstd > 0
        ? { note: `${skippedZstd} zstd-compressed thread(s) skipped — reading them needs Node 22.15+ / 23.8+` }
        : {}),
    };
  }
}

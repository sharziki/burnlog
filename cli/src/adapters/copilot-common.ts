import { statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { envDir } from "./fileutil.js";

/**
 * Shared bits of the three local GitHub Copilot sources ported from tokscale
 * (copilot_desktop.rs, copilot_session_store.rs, copilot_vscode.rs).
 *
 * tokscale reports all three under its single `copilot` client, next to the
 * OTEL export parser (copilot.rs). burnlog keeps them as separate adapters
 * (`copilot-desktop`, `copilot-session-store`, `copilot-vscode`) so none of
 * them collides with a `copilot` OTEL adapter, and so each can be detected
 * and reported on its own.
 */

/** `~/.copilot`, or BURNLOG_COPILOT_DIR. Holds data.db and session-store.db. */
export function copilotRoot(): string {
  return envDir("BURNLOG_COPILOT_DIR") ?? join(homedir(), ".copilot");
}

/** A JSON integer (serde's `as_i64`: floats and strings are not integers). */
export function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

const NAIVE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;
const OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * ISO-8601 → epoch ms. Offset-less datetimes are UTC (tokscale's chrono
 * fallbacks), which `Date.parse` would read as local time.
 */
export function parseIsoMs(value: string): number | undefined {
  const v = value.trim();
  const naive = NAIVE.exec(v);
  if (naive) {
    const t = Date.parse(`${naive[1]}T${naive[2]}Z`);
    return Number.isFinite(t) ? t : undefined;
  }
  if (OFFSET.test(v)) {
    const t = Date.parse(v.replace(" ", "T"));
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

/** Newest mtime of a SQLite file and its WAL, or 0 when missing. */
export function dbMtimeMs(db: string): number {
  let newest = 0;
  for (const p of [db, `${db}-wal`]) {
    try {
      newest = Math.max(newest, statSync(p).mtimeMs);
    } catch {
      // absent WAL is normal
    }
  }
  return newest;
}

export type Buckets = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
};

/**
 * Copilot reports input inclusive of cache reads; move the cached portion out
 * of input and keep the cache buckets as reported (copilot.rs
 * `normalize_input_tokens`).
 */
export function normalizeInput(
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  reasoning: number,
): Buckets {
  const cr = Math.max(0, cacheRead);
  return {
    input: Math.max(0, input - Math.min(cr, Math.max(0, input))),
    output: Math.max(0, output),
    cacheRead: cr,
    cacheWrite: Math.max(0, cacheWrite),
    reasoning: Math.max(0, reasoning),
  };
}

export function bucketTotal(b: Buckets): number {
  return b.input + b.output + b.cacheRead + b.cacheWrite + b.reasoning;
}

/**
 * A parsed Copilot usage record in tokscale's shape, before it becomes a
 * BurnEvent. `sessionId` and `key` never leave the adapter unhashed.
 */
export type CopilotRecord = {
  key: string;
  sessionId: string;
  model: string;
  timestampMs: number;
  tokens: Buckets;
};

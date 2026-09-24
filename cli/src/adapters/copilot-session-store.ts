import { copilotOtelSessionIds } from "./copilot.js";
import { existsSync, statSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";
import { hashId } from "./fileutil.js";
import {
  bucketTotal,
  copilotRoot,
  dbMtimeMs,
  int,
  parseIsoMs,
  type CopilotRecord,
} from "./copilot-common.js";

/**
 * GitHub Copilot CLI `session-store.db` adapter (tokscale
 * copilot_session_store.rs).
 *
 *   ~/.copilot/session-store.db      (all platforms; BURNLOG_COPILOT_DIR moves ~/.copilot)
 *
 * Table `assistant_usage_events` holds one row per assistant turn — a delta,
 * not a running total:
 *
 *   id, session_id, model, copilot_usage_model,
 *   input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
 *   reasoning_tokens, created_at
 *
 * `input_tokens` is inclusive of BOTH cache buckets, so both are subtracted
 * to get fresh input. `copilot_usage_model` (the model actually billed) wins
 * over `model`. Timestamps fall back to the owning session's `created_at`.
 * Only ids, models, token counts and timestamps are selected — never cwd,
 * summary, repository or branch.
 */

const QUERIES = [
  `SELECT e.id, e.session_id, e.model, e.copilot_usage_model,
          e.input_tokens, e.output_tokens, e.cache_read_tokens, e.cache_write_tokens,
          e.reasoning_tokens, e.created_at, s.created_at AS session_created_at
     FROM assistant_usage_events e
     LEFT JOIN sessions s ON s.id = e.session_id`,
  // Same, for a store without the sessions table.
  `SELECT e.id, e.session_id, e.model, e.copilot_usage_model,
          e.input_tokens, e.output_tokens, e.cache_read_tokens, e.cache_write_tokens,
          e.reasoning_tokens, e.created_at, NULL AS session_created_at
     FROM assistant_usage_events e`,
];

const WHERE = `
  WHERE COALESCE(e.input_tokens,0) > 0 OR COALESCE(e.output_tokens,0) > 0
     OR COALESCE(e.cache_read_tokens,0) > 0 OR COALESCE(e.cache_write_tokens,0) > 0
     OR COALESCE(e.reasoning_tokens,0) > 0 OR COALESCE(e.total_nano_aiu,0) > 0`;

/** tokscale's `parse_timestamp_str` for a TEXT (or INTEGER) column. */
function storeTs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v <= 0) return undefined;
    return v >= 1e12 ? Math.trunc(v) : Math.trunc(v) * 1000;
  }
  if (typeof v !== "string") return undefined;
  const iso = parseIsoMs(v);
  if (iso !== undefined) return iso;
  return /^-?\d+$/.test(v.trim()) ? storeTs(Number(v.trim())) : undefined;
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function tokenInt(v: unknown): number {
  const n = int(v) ?? (typeof v === "number" ? Math.trunc(v) : 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse every usage row. Throws SqliteUnavailable; returns [] when the table
 * is missing. `fallbackMs` stands in for tokscale's epoch-0 default when a row
 * has no parseable timestamp at all.
 */
export async function parseCopilotSessionStore(db: string, fallbackMs = 0): Promise<CopilotRecord[]> {
  let rows: Row[] | null = null;
  for (const q of QUERIES) {
    try {
      rows = await querySqlite(db, q + WHERE);
      break;
    } catch (err) {
      if (err instanceof SqliteUnavailable) throw err;
    }
  }
  if (!rows) return [];

  const out: CopilotRecord[] = [];
  for (const r of rows) {
    const sessionId = typeof r.session_id === "string" ? r.session_id : "";
    if (!sessionId.trim()) continue;

    const cacheRead = Math.max(0, tokenInt(r.cache_read_tokens));
    const cacheWrite = Math.max(0, tokenInt(r.cache_write_tokens));
    const input = Math.max(0, tokenInt(r.input_tokens) - cacheRead - cacheWrite);
    const model = nonEmpty(r.copilot_usage_model) ?? nonEmpty(r.model) ?? "auto";

    out.push({
      key: `copilot-session-store:${sessionId}:${String(r.id)}`,
      sessionId,
      model,
      timestampMs: storeTs(r.created_at) ?? storeTs(r.session_created_at) ?? fallbackMs,
      tokens: {
        input,
        output: Math.max(0, tokenInt(r.output_tokens)),
        cacheRead,
        cacheWrite,
        reasoning: Math.max(0, tokenInt(r.reasoning_tokens)),
      },
    });
  }
  return out;
}

export function sessionStorePath(): string {
  return join(copilotRoot(), "session-store.db");
}

export function toBurnEvent(source: string, r: CopilotRecord): BurnEvent {
  return {
    requestId: hashId(r.key),
    source,
    model: r.model,
    provider: providerFromModel(r.model),
    inputTokens: r.tokens.input,
    // tokscale keeps reasoning in its own bucket; burnlog's output includes it.
    outputTokens: r.tokens.output + r.tokens.reasoning,
    cacheCreationTokens: r.tokens.cacheWrite,
    cacheReadTokens: r.tokens.cacheRead,
    timestamp: new Date(r.timestampMs).toISOString(),
  };
}

export class CopilotSessionStoreAdapter implements Adapter {
  readonly name = "copilot-session-store" as const;

  detect(): boolean {
    return existsSync(sessionStorePath());
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = sessionStorePath();
    const base = { source: this.name, events: [] as BurnEvent[], scannedFiles: 0, totalLines: 0 };
    if (!existsSync(db)) return { ...base, note: "not installed" };
    if (!shouldRead(dbMtimeMs(db), opts.since)) return { ...base, note: "unchanged since last sync" };

    let records: CopilotRecord[];
    try {
      const covered = copilotOtelSessionIds();
      records = (await parseCopilotSessionStore(db, statSync(db).mtimeMs)).filter((r) => !covered.has(r.sessionId));
    } catch (err) {
      return {
        ...base,
        note: err instanceof SqliteUnavailable ? `detected, but ${err.message}` : "session-store.db unreadable",
      };
    }

    const byId = new Map<string, BurnEvent>();
    for (const r of records) {
      // A row billed in AIU with no token counts moves no tokens.
      if (bucketTotal(r.tokens) === 0) continue;
      const e = toBurnEvent(this.name, r);
      if (!byId.has(e.requestId)) byId.set(e.requestId, e);
    }
    return { ...base, events: [...byId.values()], scannedFiles: 1, totalLines: records.length };
  }
}

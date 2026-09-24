import { statSync } from "fs";
import type { BurnEvent } from "./types.js";
import { providerFromModel } from "./types.js";
import { querySqlite, type Row } from "./sqlite.js";

/**
 * Shared reader for the OpenCode SQLite message schema, which Kilo CLI and
 * MiMo Code both inherited (tokscale's `sessions/opencode_schema.rs`).
 *
 * Each assistant turn is one row of a `message` table whose `data` column is a
 * JSON payload:
 *
 *   { id, role, modelID, providerID, cost, agent, mode,
 *     tokens: { input, output, reasoning, cache: { read, write } },
 *     time:   { created, completed } }
 *
 * PRIVACY: the payload never carries prompt text (parts live in another
 * table), but this still pulls only the usage fields out with `json_extract`
 * inside SQLite, so nothing else ever reaches this process.
 *
 * `json_valid` is load-bearing: one malformed blob would otherwise make
 * `json_extract` abort the whole statement instead of skipping the row.
 */

export type SchemaRow = {
  rowId: string;
  /** `$.id` — the embedded message id, globally unique when present. */
  messageId?: string;
  model: string;
  providerId?: string;
  input: number;
  /** Plain output tokens; reasoning is reported separately. */
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  /** `$.time.created` as written, or undefined when `$.time` is absent. */
  created?: number;
  completed?: number;
  cost?: number;
  agent?: string;
  mode?: string;
};

const FIELDS = `
  CAST(m.id AS TEXT) AS row_id,
  json_extract(m.data, '$.id') AS mid,
  json_extract(m.data, '$.modelID') AS model,
  json_extract(m.data, '$.providerID') AS provider,
  json_type(m.data, '$.tokens.input') AS input_t,
  json_extract(m.data, '$.tokens.input') AS input,
  json_type(m.data, '$.tokens.output') AS output_t,
  json_extract(m.data, '$.tokens.output') AS output,
  json_extract(m.data, '$.tokens.reasoning') AS reasoning,
  json_type(m.data, '$.tokens.cache') AS cache_t,
  json_extract(m.data, '$.tokens.cache.read') AS cache_read,
  json_extract(m.data, '$.tokens.cache.write') AS cache_write,
  json_type(m.data, '$.time') AS time_t,
  json_extract(m.data, '$.time.created') AS created,
  json_extract(m.data, '$.time.completed') AS completed,
  json_extract(m.data, '$.cost') AS cost,
  json_extract(m.data, '$.agent') AS agent,
  json_extract(m.data, '$.mode') AS mode`;

export const SCHEMA_QUERY = `
  SELECT ${FIELDS}
  FROM message m
  WHERE json_valid(m.data)
    AND json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(m.data, '$.tokens') IS NOT NULL`;

const int = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Apply tokscale's per-row acceptance rules. `strictCache` (Kilo) drops a row
 * whose `tokens.cache` lacks either `read` or `write`; MiMo tolerates it.
 * Returns null for a row tokscale would reject.
 */
export function toSchemaRow(r: Row, strictCache: boolean): SchemaRow | null {
  // tokens.input / tokens.output are mandatory integers in the Rust type; a
  // payload missing either fails to deserialize and is skipped.
  if (r.input_t !== "integer" || r.output_t !== "integer") return null;
  const model = str(r.model);
  if (model === undefined) return null;

  const hasRead = isNum(r.cache_read);
  const hasWrite = isNum(r.cache_write);
  if (strictCache && !(r.cache_t === "object" && hasRead && hasWrite)) return null;

  // A present `$.time` must carry a numeric `created`, or the payload fails.
  let created: number | undefined;
  if (r.time_t !== null && r.time_t !== undefined) {
    if (!isNum(r.created)) return null;
    created = r.created;
  }

  return {
    rowId: String(r.row_id),
    messageId: str(r.mid),
    model,
    providerId: str(r.provider),
    input: int(r.input),
    output: int(r.output),
    reasoning: int(r.reasoning),
    cacheRead: hasRead ? int(r.cache_read) : 0,
    cacheWrite: hasWrite ? int(r.cache_write) : 0,
    created,
    completed: isNum(r.completed) ? r.completed : undefined,
    cost: isNum(r.cost) && r.cost >= 0 ? r.cost : undefined,
    agent: str(r.agent),
    mode: str(r.mode),
  };
}

export async function readSchemaRows(db: string, strictCache: boolean): Promise<SchemaRow[]> {
  const rows = await querySqlite(db, SCHEMA_QUERY);
  const out: SchemaRow[] = [];
  for (const r of rows) {
    const row = toSchemaRow(r, strictCache);
    if (row) out.push(row);
  }
  return out;
}

/** Trust an explicit provider burnlog stores; otherwise infer from the model. */
export function resolveProvider(providerId: string | undefined, model: string): BurnEvent["provider"] {
  const p = providerId?.toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google") return p;
  return providerFromModel(model);
}

/**
 * Newest write to a SQLite database. Under WAL the main file's mtime can lag
 * for a long time while `-wal` takes every write, so both are checked.
 */
export function dbMtimeMs(db: string): number {
  let newest = 0;
  for (const p of [db, `${db}-wal`]) {
    try {
      newest = Math.max(newest, statSync(p).mtimeMs);
    } catch {
      /* no sidecar */
    }
  }
  return newest;
}

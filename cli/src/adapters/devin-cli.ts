import { readdirSync, realpathSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";
import { envDir, hashId, isDir, xdgData } from "./fileutil.js";
import { dbMtimeMs } from "./opencode-schema.js";

/**
 * Devin CLI adapter — reads `sessions.db` (tokscale's `sessions/devin.rs`,
 * CLI half; the Desktop ACP event streams are a separate client).
 *
 * Each assistant turn is a row of `message_nodes`. Usage is NOT in the
 * `metadata` column (always NULL in real databases) but inside the
 * `chat_message` JSON, under `$.metadata`:
 *
 *   metrics: { input_tokens, output_tokens, cache_read_tokens,
 *              cache_creation_tokens, total_time_ms }
 *   generation_model, request_id, num_tokens
 *
 * PRIVACY: `chat_message` also holds the message text, so the fields are
 * pulled out with `json_extract` inside SQLite; the blob itself is never read.
 *
 * Semantics ported from tokscale:
 *   - model = `generation_model`, else `sessions.model` — but `adaptive` is a
 *     routing mode, not a model, and such rows are skipped;
 *   - buckets map 1:1 (input already excludes cache); when `metrics` sum to 0
 *     but `num_tokens` is set, it all counts as output; zero rows are skipped;
 *   - `created_at` (epoch seconds) is when the finished row was written, i.e.
 *     the turn's end, so the timestamp is back-anchored by `total_time_ms`;
 *   - Devin can store one response twice; `request_id` names the API call, so
 *     it is the dedupe key, with the row id as fallback for older rows.
 *
 * Locations: $XDG_DATA_HOME/devin/cli/sessions.db (~/.local/share/...), plus
 * %APPDATA%\devin\cli on Windows. A root may be the db itself or a directory
 * searched for `sessions.db`. Override with BURNLOG_DEVIN_CLI_DIR.
 */

function roots(): string[] {
  const explicit = envDir("BURNLOG_DEVIN_CLI_DIR");
  if (explicit) return [explicit];
  const out = [join(xdgData(), "devin", "cli", "sessions.db")];
  const appdata = envDir("APPDATA");
  if (process.platform === "win32" && appdata) out.push(join(appdata, "devin", "cli"));
  out.push(join(homedir(), "AppData", "Roaming", "devin", "cli"));
  return out;
}

function findDbs(root: string, depth = 0, out: string[] = []): string[] {
  try {
    const st = statSync(root);
    if (st.isFile()) {
      if (root.endsWith("sessions.db")) out.push(root);
      return out;
    }
  } catch {
    return out;
  }
  if (depth > 6 || !isDir(root)) return out;
  let names: string[] = [];
  try {
    names = readdirSync(root);
  } catch {
    return out;
  }
  for (const n of names.sort()) {
    const full = join(root, n);
    if (n === "sessions.db") out.push(full);
    else if (isDir(full)) findDbs(full, depth + 1, out);
  }
  return out;
}

function discover(): string[] {
  const seen = new Set<string>();
  const dbs: string[] = [];
  for (const r of roots()) {
    for (const db of findDbs(r)) {
      let key = db;
      try {
        key = realpathSync(db);
      } catch {
        /* literal */
      }
      if (!seen.has(key)) {
        seen.add(key);
        dbs.push(db);
      }
    }
  }
  return dbs;
}

const QUERY = `
  SELECT m.row_id AS row_id,
         m.session_id AS session_id,
         m.created_at * 1000 AS created_ms,
         s.model AS session_model,
         json_extract(m.chat_message, '$.role') AS role,
         json_extract(m.chat_message, '$.metadata.generation_model') AS gen_model,
         json_extract(m.chat_message, '$.metadata.request_id') AS request_id,
         json_extract(m.chat_message, '$.metadata.num_tokens') AS num_tokens,
         json_extract(m.chat_message, '$.metadata.metrics.input_tokens') AS input_tokens,
         json_extract(m.chat_message, '$.metadata.metrics.output_tokens') AS output_tokens,
         json_extract(m.chat_message, '$.metadata.metrics.cache_read_tokens') AS cache_read_tokens,
         json_extract(m.chat_message, '$.metadata.metrics.cache_creation_tokens') AS cache_creation_tokens,
         json_extract(m.chat_message, '$.metadata.metrics.total_time_ms') AS total_time_ms
  FROM message_nodes m
  JOIN sessions s ON m.session_id = s.id
  WHERE json_valid(m.chat_message)
  ORDER BY m.row_id`;

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isRouting = (m: string): boolean => m === "adaptive";

export class DevinCliAdapter implements Adapter {
  readonly name = "devin-cli" as const;

  detect(): boolean {
    return discover().length > 0;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const dbs = discover();
    if (dbs.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    let unreadable = 0;

    for (const db of dbs) {
      const mtime = dbMtimeMs(db);
      if (!shouldRead(mtime, opts.since)) continue;
      let rows: Row[];
      try {
        rows = await querySqlite(db, QUERY);
      } catch (err) {
        if (err instanceof SqliteUnavailable) {
          return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: `detected, but ${err.message}` };
        }
        // A database that predates message_nodes has nothing to offer.
        unreadable++;
        continue;
      }
      scannedFiles++;
      totalLines += rows.length;

      for (const r of rows) {
        if (r.role !== "assistant") continue;
        const gen = s(r.gen_model);
        const sessionModel = s(r.session_model);
        const model = gen || sessionModel;
        if (!model || isRouting(model)) continue;

        let input = n(r.input_tokens);
        let output = n(r.output_tokens);
        let cacheRead = n(r.cache_read_tokens);
        let cacheWrite = n(r.cache_creation_tokens);
        if (input + output + cacheRead + cacheWrite === 0 && typeof r.num_tokens === "number") {
          input = cacheRead = cacheWrite = 0;
          output = n(r.num_tokens);
        }
        if (input + output + cacheRead + cacheWrite === 0) continue;

        const created = typeof r.created_ms === "number" && Number.isFinite(r.created_ms) ? r.created_ms : undefined;
        const duration = n(r.total_time_ms);
        let ts = created ?? mtime;
        if (created !== undefined && duration > 0 && created - duration > 0) ts = created - duration;

        const sessionId = String(r.session_id ?? "");
        const req = s(r.request_id);
        // Session ids are opaque, but hash anyway so the id carries nothing.
        const key = hashId(sessionId, req ? `request:${req}` : `row:${String(r.row_id)}`);
        if (byKey.has(key)) continue;

        byKey.set(key, {
          requestId: key,
          source: this.name,
          model,
          provider: providerFromModel(model),
          inputTokens: input,
          outputTokens: output,
          cacheCreationTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          timestamp: new Date(Math.trunc(ts)).toISOString(),
        });
      }
    }

    const notes: string[] = [];
    if (scannedFiles === 0 && unreadable === 0) notes.push("unchanged since last sync");
    if (unreadable > 0) notes.push(`${unreadable} database(s) had no message_nodes table`);
    return {
      source: this.name,
      events: [...byKey.values()],
      scannedFiles,
      totalLines,
      ...(notes.length ? { note: notes.join("; ") } : {}),
    };
  }
}

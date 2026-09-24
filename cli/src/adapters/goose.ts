import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead, splitOversized } from "./types.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";
import { appData, envDir, toMs, xdgData } from "./fileutil.js";
import { dbMtimeMs, resolveProvider } from "./opencode-schema.js";

/**
 * Goose (Block) adapter — reads `sessions/sessions.db`.
 *
 * Goose keeps usage per SESSION, not per call: each row of `sessions` carries
 * the running totals for the whole conversation. tokscale reads it the same
 * way (sessions/goose.rs), one event per session keyed by the session id:
 *
 *   input  = accumulated_input_tokens  ?? input_tokens
 *   output = accumulated_output_tokens ?? output_tokens
 *   total  = accumulated_total_tokens  ?? total_tokens
 *
 * The `accumulated_*` columns are the session-lifetime sums; the bare columns
 * are only the latest turn's context, so they are a fallback for old rows.
 * Goose has no cache or reasoning columns. tokscale attributes any gap between
 * `total` and `input + output` to reasoning, which burnlog counts as output.
 *
 * The model comes from `model_config_json.model_name`; rows without one are
 * skipped. Only numeric/model columns are selected — never the session name,
 * description or working directory.
 *
 * Because a session's totals grow, the event for a session is re-emitted with
 * larger numbers on a later sync under the same id.
 *
 * Location, first existing (tokscale's order):
 *   $GOOSE_PATH_ROOT/data/sessions/sessions.db
 *   $XDG_DATA_HOME/goose/sessions/sessions.db        (~/.local/share/...)
 *   ~/Library/Application Support/goose/sessions/sessions.db
 *   ~/Library/Application Support/Block/goose/sessions/sessions.db
 *   ~/.local/share/Block/goose/sessions/sessions.db
 *   %APPDATA%\Block\goose\data\sessions\sessions.db   (Windows; burnlog addition)
 *
 * Override with BURNLOG_GOOSE_DIR (the directory holding sessions.db).
 */

function candidates(): string[] {
  const explicit = envDir("BURNLOG_GOOSE_DIR");
  if (explicit) return [join(explicit, "sessions.db")];
  const home = homedir();
  const out: string[] = [];
  const root = envDir("GOOSE_PATH_ROOT");
  if (root) out.push(join(root.trim(), "data", "sessions", "sessions.db"));
  out.push(
    join(xdgData(), "goose", "sessions", "sessions.db"),
    join(home, "Library", "Application Support", "goose", "sessions", "sessions.db"),
    join(home, "Library", "Application Support", "Block", "goose", "sessions", "sessions.db"),
    join(home, ".local", "share", "Block", "goose", "sessions", "sessions.db"),
  );
  if (process.platform === "win32") out.push(join(appData(), "Block", "goose", "data", "sessions", "sessions.db"));
  return out;
}

const QUERY = `
  SELECT id,
         json_extract(model_config_json, '$.model_name') AS model_name,
         provider_name,
         created_at,
         total_tokens, input_tokens, output_tokens,
         accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens
  FROM sessions
  WHERE model_config_json IS NOT NULL
    AND TRIM(model_config_json) != ''
    AND json_valid(model_config_json)`;

const opt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;

/** Goose writes `created_at` as RFC 3339, `YYYY-MM-DD HH:MM:SS` (UTC) or a date. */
function createdMs(v: unknown): number | undefined {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return Date.parse(`${v.trim()}T00:00:00Z`);
  return toMs(v);
}

export class GooseAdapter implements Adapter {
  readonly name = "goose" as const;

  private get dbPath(): string | null {
    return candidates().find((p) => existsSync(p)) ?? null;
  }

  detect(): boolean {
    return this.dbPath !== null;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = this.dbPath;
    const empty = (note: string, scannedFiles = 0): ScanResult => ({
      source: this.name,
      events: [],
      scannedFiles,
      totalLines: 0,
      note,
    });
    if (!db) return empty("not installed");
    const mtime = dbMtimeMs(db);
    if (!shouldRead(mtime, opts.since)) return empty("unchanged since last sync");

    let rows: Row[];
    try {
      rows = await querySqlite(db, QUERY);
    } catch (err) {
      if (err instanceof SqliteUnavailable) return empty(`detected, but ${err.message}`);
      return empty("sessions.db present but has no usage columns (older goose?)", 1);
    }

    const events: BurnEvent[] = [];
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : row.id != null ? String(row.id) : "";
      const model = typeof row.model_name === "string" ? row.model_name.trim() : "";
      if (!id || !model) continue;

      const input = Math.max(0, opt(row.accumulated_input_tokens) ?? opt(row.input_tokens) ?? 0);
      const output = Math.max(0, opt(row.accumulated_output_tokens) ?? opt(row.output_tokens) ?? 0);
      const total = Math.max(0, opt(row.accumulated_total_tokens) ?? opt(row.total_tokens) ?? 0);
      if (input === 0 && output === 0 && total === 0) continue;
      // Inferred, as in tokscale: the unexplained remainder is reasoning.
      const reasoning = total > input + output ? total - input - output : 0;
      if (input + output + reasoning === 0) continue;

      // tokscale falls back to epoch 0 on an unparseable date; the db's mtime
      // is a less wrong answer for a leaderboard.
      const ts = createdMs(row.created_at) ?? mtime;

      events.push(
        ...splitOversized({
          requestId: id,
          source: this.name,
          model,
          provider: resolveProvider(typeof row.provider_name === "string" ? row.provider_name : undefined, model),
          inputTokens: input,
          outputTokens: output + reasoning,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          timestamp: new Date(ts).toISOString(),
        }),
      );
    }

    return { source: this.name, events, scannedFiles: 1, totalLines: rows.length };
  }
}

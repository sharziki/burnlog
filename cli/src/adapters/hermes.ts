import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import type { Adapter, BurnEvent, ScanResult } from "./types.js";
import { providerFromModel } from "./types.js";

/**
 * Hermes agent adapter — reads `~/.hermes/state.db`.
 *
 * Two tables carry usage and they OVERLAP:
 *   - `sessions`            one row per session, usage rolled up
 *   - `session_model_usage` one row per (session, model)
 *
 * Verified against a real install: every session with usage is represented in
 * `session_model_usage`, and its totals are a strict superset. So we read the
 * per-model table only — reading both would double count the entire dataset.
 * The per-model grain is also what burnlog wants, since it attributes tokens
 * to the model that actually burned them.
 *
 * Bucket convention (opposite to Codex, checked against real data):
 *   cache_read_tokens is a SEPARATE bucket, not part of input_tokens —
 *   on this install it is 718M against 41M of input, so it cannot be a
 *   subset. reasoning_tokens IS inside output_tokens and must not be added.
 *
 * sqlite3 is invoked as a subprocess rather than taking a native dependency:
 * the CLI ships with zero runtime deps and shouldn't need a build toolchain
 * to install.
 */
export class HermesAdapter implements Adapter {
  readonly name = "hermes" as const;

  private get dbPath(): string | null {
    const explicit = process.env.BURNLOG_HERMES_DB;
    if (explicit) return existsSync(explicit) ? explicit : null;
    const root = process.env.BURNLOG_HERMES_DIR ?? join(homedir(), ".hermes");
    const guess = join(root, "state.db");
    return existsSync(guess) ? guess : null;
  }

  detect(): boolean {
    return this.dbPath !== null;
  }

  scan(): ScanResult {
    const db = this.dbPath;
    if (!db) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "not installed",
      };
    }

    // Open read-only via a file: URI so a running Hermes is never disturbed.
    const sql = `
      SELECT session_id, model, api_call_count,
             input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
             COALESCE(last_seen, first_seen) AS seen
      FROM session_model_usage
      WHERE (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) > 0;
    `;

    let raw: string;
    try {
      raw = execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "detected, but the `sqlite3` command is unavailable — install it to read hermes usage",
      };
    }

    let rows: Record<string, unknown>[];
    try {
      rows = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
    } catch {
      return {
        source: this.name,
        events: [],
        scannedFiles: 1,
        totalLines: 0,
        note: "state.db present but unreadable",
      };
    }

    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;

    const events: BurnEvent[] = [];
    for (const row of rows) {
      const input = num(row.input_tokens);
      const output = num(row.output_tokens);
      const cacheRead = num(row.cache_read_tokens);
      const cacheWrite = num(row.cache_write_tokens);
      if (input + output + cacheRead + cacheWrite === 0) continue;

      const model = typeof row.model === "string" && row.model ? row.model : "unknown";
      const sessionId = String(row.session_id ?? "");
      if (!sessionId) continue;

      events.push({
        // One event per (session, model) — matches the table's grain, so a
        // re-scan dedupes cleanly on the server's (user, source, requestId).
        requestId: `${sessionId}:${model}`,
        source: this.name,
        model,
        provider: providerFromModel(model),
        inputTokens: input,
        // reasoning_tokens is already inside output_tokens.
        outputTokens: output,
        cacheCreationTokens: cacheWrite,
        cacheReadTokens: cacheRead,
        timestamp: toIso(row.seen),
      });
    }

    return { source: this.name, events, scannedFiles: 1, totalLines: rows.length };
  }
}

/** Hermes stores timestamps as ISO strings or epoch seconds depending on age. */
function toIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

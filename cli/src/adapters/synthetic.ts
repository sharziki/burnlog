import { existsSync, statSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, num, xdgData } from "./fileutil.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";

/**
 * Synthetic (synthetic.new) adapter — Octofriend's SQLite database.
 *
 *   ~/.local/share/octofriend/sqlite.db        ($XDG_DATA_HOME honoured)
 *
 * Ported from tokscale `sessions/synthetic.rs`, which is explicitly
 * future-proofing: current Octofriend builds persist only input history, no
 * token data. When a token table appears it is read from:
 *   - `messages`   (id, model, input_tokens, output_tokens, cache_read_tokens,
 *                   cache_write_tokens, reasoning_tokens, timestamp), else
 *   - `token_usage` (id, model, input_tokens, output_tokens, timestamp).
 * Only those columns are selected. Reasoning is added into output.
 *
 * synthetic.new model ids (`hf:org/Model`, `accounts/fireworks/models/x`) are
 * normalized to the bare lowercase model name, as tokscale does.
 *
 * Not ported: tokscale also re-labels other agents' traffic routed through the
 * synthetic.new gateway (by `hf:` model prefix / provider name) as
 * "synthetic". That is a reporting filter over events those agents' own
 * adapters already upload; emitting them here too would double count.
 *
 * Override the Octofriend data dir with BURNLOG_SYNTHETIC_DIR.
 */

function octofriendDir(): string {
  return envDir("BURNLOG_SYNTHETIC_DIR") ?? join(xdgData(), "octofriend");
}

/** "hf:deepseek-ai/DeepSeek-V3-0324" → "deepseek-v3-0324"; fireworks/together likewise. */
export function normalizeSyntheticModel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith("hf:")) {
    const rest = lower.slice(3);
    const slash = rest.indexOf("/");
    return slash >= 0 ? rest.slice(slash + 1) : rest;
  }
  if (lower.startsWith("accounts/")) {
    const i = lower.indexOf("/models/", "accounts/".length);
    if (i >= 0) return lower.slice(i + "/models/".length);
  }
  return lower;
}

function tsMs(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
}

const MESSAGES_SQL = `
  SELECT id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         reasoning_tokens, timestamp
  FROM messages WHERE input_tokens IS NOT NULL OR output_tokens IS NOT NULL`;

const TOKEN_USAGE_SQL = `
  SELECT id, model, input_tokens, output_tokens, timestamp
  FROM token_usage WHERE input_tokens > 0 OR output_tokens > 0`;

async function tryQuery(db: string, sql: string): Promise<Row[]> {
  try {
    return await querySqlite(db, sql);
  } catch (err) {
    if (err instanceof SqliteUnavailable) throw err;
    return []; // table or column absent: the expected case today
  }
}

export class SyntheticAdapter implements Adapter {
  readonly name = "synthetic" as const;

  private get dbPath(): string {
    return join(octofriendDir(), "sqlite.db");
  }

  detect(): boolean {
    return existsSync(this.dbPath);
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = this.dbPath;
    if (!existsSync(db)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    const mtime = Math.max(...[db, `${db}-wal`].map((p) => (existsSync(p) ? statSync(p).mtimeMs : 0)));
    if (!shouldRead(mtime, opts.since)) return { source: this.name, events: [], scannedFiles: 0, totalLines: 0 };

    let rows: Row[];
    try {
      rows = await tryQuery(db, MESSAGES_SQL);
      if (rows.length === 0) rows = await tryQuery(db, TOKEN_USAGE_SQL);
    } catch (err) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: `detected, but ${(err as Error).message}`,
      };
    }

    const byId = new Map<string, BurnEvent>();
    for (const r of rows) {
      const id = r.id == null ? "" : String(r.id);
      if (!id) continue;
      const input = num(r.input_tokens);
      const output = num(r.output_tokens) + num(r.reasoning_tokens);
      const cacheRead = num(r.cache_read_tokens);
      const cacheWrite = num(r.cache_write_tokens);
      const ts = tsMs(r.timestamp);
      if (input + output + cacheRead + cacheWrite === 0 || ts <= 0) continue;
      const model = normalizeSyntheticModel(typeof r.model === "string" ? r.model : "") || "unknown";
      byId.set(id, {
        requestId: `synthetic:${id}`,
        source: this.name,
        model,
        provider: providerFromModel(model),
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: cacheWrite,
        cacheReadTokens: cacheRead,
        timestamp: new Date(ts).toISOString(),
      });
    }
    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles: 1,
      totalLines: rows.length,
      ...(rows.length === 0 ? { note: "installed, but this Octofriend build stores no token usage" } : {}),
    };
  }
}

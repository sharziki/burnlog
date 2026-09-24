import { existsSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { SqliteUnavailable } from "./sqlite.js";
import { envDir, xdgData } from "./fileutil.js";
import { dbMtimeMs, readSchemaRows, resolveProvider } from "./opencode-schema.js";

/**
 * Kilo CLI adapter — reads `kilo.db`.
 *
 * Kilo CLI is an OpenCode fork and keeps OpenCode's SQLite schema: one row
 * per message in a `message` table, usage inside the JSON `data` column (see
 * opencode-schema.ts). Location, as tokscale resolves it (XdgData root):
 *
 *   $XDG_DATA_HOME/kilo/kilo.db   (default ~/.local/share/kilo/kilo.db)
 *
 * Kilo's departures from OpenCode, ported from tokscale's
 * `OpenCodeSchemaConfig::kilo`:
 *   - only the flat `modelID` / `providerID` fields are read;
 *   - `tokens.cache` must carry both `read` and `write`, or the row is dropped;
 *   - a turn with no `time` object is kept, dated at the database's mtime;
 *   - no fingerprint dedupe — one row is one turn. The id is the payload's
 *     embedded `$.id`, else the row id.
 *
 * Buckets: input excludes cache; reasoning is separate in the payload and is
 * folded into output here, as the opencode adapter does.
 *
 * Override with BURNLOG_KILO_DIR (the directory holding kilo.db).
 */
export class KiloAdapter implements Adapter {
  readonly name = "kilo" as const;

  private get dbPath(): string | null {
    const root = envDir("BURNLOG_KILO_DIR") ?? join(xdgData(), "kilo");
    const db = join(root, "kilo.db");
    return existsSync(db) ? db : null;
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
    if (!shouldRead(mtime, opts.since)) return empty("unchanged since last sync", 0);

    let rows;
    try {
      rows = await readSchemaRows(db, true);
    } catch (err) {
      if (err instanceof SqliteUnavailable) return empty(`detected, but ${err.message}`);
      return empty("kilo.db present but has no readable message table", 1);
    }

    const byId = new Map<string, BurnEvent>();
    for (const r of rows) {
      const created = r.created ?? mtime;
      const cacheCreationTokens = r.cacheWrite;
      const cacheReadTokens = r.cacheRead;
      const outputTokens = r.output + r.reasoning;
      if (r.input + outputTokens + cacheCreationTokens + cacheReadTokens === 0) continue;

      const requestId = r.messageId ?? r.rowId;
      if (byId.has(requestId)) continue;
      byId.set(requestId, {
        requestId,
        source: this.name,
        model: r.model,
        provider: resolveProvider(r.providerId, r.model),
        inputTokens: r.input,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        timestamp: new Date(Math.trunc(created)).toISOString(),
      });
    }

    return { source: this.name, events: [...byId.values()], scannedFiles: 1, totalLines: rows.length };
  }
}

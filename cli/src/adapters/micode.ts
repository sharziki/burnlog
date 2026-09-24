import { readdirSync, realpathSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { SqliteUnavailable } from "./sqlite.js";
import { envDir, hashId, xdgData } from "./fileutil.js";
import { dbMtimeMs, readSchemaRows, resolveProvider, type SchemaRow } from "./opencode-schema.js";

/**
 * MiMo Code adapter — reads `mimocode*.db`.
 *
 * MiMo Code (Xiaomi) is another OpenCode-schema store (see opencode-schema.ts):
 * assistant turns are rows of `message` with usage in the JSON `data` column.
 * MiMo picks its file name by release channel, so every `mimocode.db` and
 * `mimocode-<channel>.db` is read. Locations, as tokscale scans them:
 *
 *   $XDG_DATA_HOME/mimocode/          (default ~/.local/share/mimocode)
 *   ~/Library/Application Support/orca/mimocode-hooks/shared/data/
 *                                     (MiMo driven through orca's hook sandbox;
 *                                      can hold sessions the XDG copy lacks)
 *
 * Departures from OpenCode, from tokscale's `OpenCodeSchemaConfig::micode`:
 *   - `tokens.cache` may be missing or partial; absent buckets count as 0;
 *   - some builds write epoch SECONDS; values <= 1e12 are scaled to ms;
 *   - a turn with no `time` object is dropped.
 *
 * Dedupe, as tokscale's MiMo reducer does it:
 *   1. by the embedded `$.id` across every database (the same message in two
 *      channel/orca copies is one turn), falling back to a per-database row id;
 *   2. within ONE database, rows identical on every usage field (times, model,
 *      provider, all token buckets, cost, agent) are one turn copied into a
 *      forked session under a fresh id.
 *
 * Xiaomi MiMo AI (desktop) shares this store; tokscale re-labels those
 * sessions as a separate `micode-desktop` client. burnlog counts them here.
 *
 * Override the data directory with BURNLOG_MICODE_DIR.
 */

const DB_NAME = /^mimocode(-[A-Za-z0-9._-]+)?\.db$/;

function dataDirs(): string[] {
  const explicit = envDir("BURNLOG_MICODE_DIR");
  if (explicit) return [explicit];
  return [
    join(xdgData(), "mimocode"),
    join(homedir(), "Library", "Application Support", "orca", "mimocode-hooks", "shared", "data"),
  ];
}

function discoverDbs(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dataDirs()) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!DB_NAME.test(name)) continue;
      const full = join(dir, name);
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      // One file reachable under two spellings (a symlinked root) is one file.
      let key = full;
      try {
        key = realpathSync(full);
      } catch {
        /* keep literal */
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(full);
    }
  }
  return out;
}

const toMs = (t: number): number => (t > 1e12 ? t : t * 1000);

function fingerprint(r: SchemaRow): string {
  return JSON.stringify([
    r.created,
    r.completed ?? null,
    r.model,
    r.providerId ?? "",
    r.input,
    r.output,
    r.reasoning,
    r.cacheRead,
    r.cacheWrite,
    r.cost ?? 0,
    // tokscale resolves the agent as mode-then-agent for MiMo.
    r.mode ?? r.agent ?? null,
  ]);
}

export class MicodeAdapter implements Adapter {
  readonly name = "micode" as const;

  detect(): boolean {
    return discoverDbs().length > 0;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const dbs = discoverDbs();
    const result = (events: BurnEvent[], scannedFiles: number, totalLines: number, note?: string): ScanResult => ({
      source: this.name,
      events,
      scannedFiles,
      totalLines,
      ...(note ? { note } : {}),
    });
    if (dbs.length === 0) return result([], 0, 0, "not installed");

    // Cross-database dedupe needs every copy, so if any file changed, read all.
    if (!dbs.some((db) => shouldRead(dbMtimeMs(db), opts.since))) {
      return result([], 0, 0, "unchanged since last sync");
    }

    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    const failures: string[] = [];

    for (const db of dbs) {
      let rows: SchemaRow[];
      try {
        rows = await readSchemaRows(db, false);
      } catch (err) {
        if (err instanceof SqliteUnavailable) return result([], 0, 0, `detected, but ${err.message}`);
        failures.push(db);
        continue;
      }
      scannedFiles++;
      totalLines += rows.length;

      const fingerprints = new Set<string>();
      for (const r of rows) {
        if (r.created === undefined) continue;
        const fp = fingerprint(r);
        if (fingerprints.has(fp)) continue;
        fingerprints.add(fp);

        // Embedded ids are global; row ids only mean something inside one
        // file, and the path must not leak into the id, hence the hash.
        const key = r.messageId ?? `row:${hashId(db, r.rowId)}`;
        if (byKey.has(key)) continue;

        const outputTokens = r.output + r.reasoning;
        if (r.input + outputTokens + r.cacheRead + r.cacheWrite === 0) continue;

        byKey.set(key, {
          requestId: key,
          source: this.name,
          model: r.model,
          provider: resolveProvider(r.providerId, r.model),
          inputTokens: r.input,
          outputTokens,
          cacheCreationTokens: r.cacheWrite,
          cacheReadTokens: r.cacheRead,
          timestamp: new Date(Math.trunc(toMs(r.created))).toISOString(),
        });
      }
    }

    const note =
      failures.length > 0 ? `${failures.length} database(s) had no readable message table` : undefined;
    return result([...byKey.values()], scannedFiles, totalLines, note);
  }
}

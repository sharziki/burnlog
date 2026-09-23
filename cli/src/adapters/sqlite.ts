import { execFileSync } from "child_process";

/**
 * Read-only SQLite for adapters whose agent keeps usage in a database
 * (Goose, Zed, Kilo, Cursor's login, ...).
 *
 * No native dependency: `node:sqlite` is built into Node 22.13+ and needs no
 * flag there. On older Node (the CLI supports 20) it falls back to the
 * `sqlite3` command, which the Hermes adapter has always used. If neither is
 * available the adapter says so in its note instead of guessing.
 */

export type Row = Record<string, unknown>;

export class SqliteUnavailable extends Error {
  constructor() {
    super("reading this source needs Node 22.13+ or the `sqlite3` command");
  }
}

type DatabaseSync = new (
  path: string,
  opts?: { readOnly?: boolean },
) => { prepare(sql: string): { all(...params: unknown[]): Row[] }; close(): void };

let builtin: DatabaseSync | null | undefined;

async function loadBuiltin(): Promise<DatabaseSync | null> {
  if (builtin !== undefined) return builtin;
  try {
    // A variable specifier keeps TypeScript (and older @types/node) from
    // resolving the module at compile time.
    const name = "node:sqlite";
    // node:sqlite prints an ExperimentalWarning on first load; it is noise to
    // a user who ran `burnlog scan`.
    const emit = process.emitWarning;
    process.emitWarning = (() => {}) as typeof process.emitWarning;
    try {
      const mod = (await import(name)) as { DatabaseSync: DatabaseSync };
      builtin = mod.DatabaseSync;
    } finally {
      process.emitWarning = emit;
    }
  } catch {
    builtin = null;
  }
  return builtin;
}

/** Run one read-only query and return plain row objects. */
export async function querySqlite(db: string, sql: string): Promise<Row[]> {
  const Database = await loadBuiltin();
  if (Database) {
    const handle = new Database(db, { readOnly: true });
    try {
      return handle.prepare(sql).all();
    } finally {
      handle.close();
    }
  }

  let raw: string;
  try {
    raw = execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new SqliteUnavailable();
    throw err;
  }
  return raw.trim() ? (JSON.parse(raw) as Row[]) : [];
}

import { homedir } from "os";
import { basename, join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import {
  type Buckets,
  EventSet,
  collectFiles,
  envPath,
  isDir,
  isFile,
  makeEvent,
  mapProvider,
  mtimeMs,
  obj,
  parseJson,
  parseRfc3339,
  readLines,
} from "./jsonl-kit.js";
import { querySqlite, SqliteUnavailable } from "./sqlite.js";

/**
 * ZCode (Zhipu) — two sources, both under `~/.zcode` on every OS. Port of
 * tokscale's `sessions/zcode.rs`.
 *
 * 1. JSONL transcripts `~/.zcode/projects/<slug>/<session>.jsonl`. Assistant
 *    lines may carry `usage` (or `token_usage`) with any of the aliases
 *    input/input_tokens/prompt_tokens/inputTokens, output/…, cache_read/…,
 *    cache_write/…, reasoning/reasoningTokens, total/totalTokens. Key:
 *    `<session>:<assistant index>`.
 *
 * 2. The CLI's SQLite store `~/.zcode/cli/db/db.sqlite`, table `model_usage`
 *    (one row per model call). Key: the row id.
 *
 * Input/cache and output/reasoning overlap is ambiguous per record, so
 * tokscale decides from the reported total: if total == input + output while
 * cache or reasoning is non-zero, input includes the cache buckets and output
 * includes reasoning, and they are subtracted. Legacy databases without
 * `computed_total_tokens` are always inclusive. burnlog then adds reasoning
 * back into output, so the output figure is the billed one either way.
 *
 * Not ported: tokscale's ~4 chars/token ESTIMATE for assistant lines with no
 * usage — it measures message text, which burnlog does not read.
 *
 * Override the `~/.zcode` directory with BURNLOG_ZCODE_DIR.
 */

const UNKNOWN_MODEL = "glm-5.2";

function nn(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function sub(value: number, overlap: number): number {
  return Math.max(0, value - Math.min(overlap, value));
}

/** tokscale's `normalize_zcode_input_and_output`, returning net input/output. */
function normalize(
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  reasoning: number,
  total: number | undefined,
): [number, number] {
  if (total === undefined) return [input, output];
  const t = Math.max(0, total);
  const cache = cacheRead + cacheWrite;
  const inclusive = input + output;
  const exclusive = inclusive + cache + reasoning;
  if ((cache > 0 || reasoning > 0) && t === inclusive && t !== exclusive) {
    return [sub(input, cache), sub(output, reasoning)];
  }
  return [input, output];
}

function first(u: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (u[k] !== undefined && u[k] !== null) return u[k];
  return undefined;
}

function jsonlBuckets(u: Record<string, unknown>): Buckets | null {
  const input = nn(first(u, ["input", "input_tokens", "prompt_tokens", "inputTokens"]));
  const output = nn(first(u, ["output", "output_tokens", "completion_tokens", "outputTokens"]));
  const cacheRead = nn(first(u, ["cache_read", "input_cache_read", "cache_read_tokens", "cacheReadTokens"]));
  const cacheWrite = nn(first(u, ["cache_write", "input_cache_creation", "cache_write_tokens", "cacheCreationTokens"]));
  const reasoning = nn(first(u, ["reasoning", "reasoningTokens"]));
  if (input + output + cacheRead + cacheWrite + reasoning === 0) return null;
  const totalRaw = first(u, ["total", "totalTokens"]);
  const total = typeof totalRaw === "number" ? totalRaw : undefined;
  const [netIn, netOut] = normalize(input, output, cacheRead, cacheWrite, reasoning, total);
  return { input: netIn, output: netOut + reasoning, cacheRead, cacheWrite };
}

type UsageRow = {
  id?: unknown;
  model_id?: unknown;
  started_at?: unknown;
  completed_at?: unknown;
  duration_ms?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  reasoning_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  computed_total_tokens?: unknown;
};

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  return undefined;
}

export class ZcodeAdapter implements Adapter {
  readonly name = "zcode" as const;

  private get home(): string {
    return envPath("BURNLOG_ZCODE_DIR") ?? join(homedir(), ".zcode");
  }

  detect(): boolean {
    return isDir(this.home);
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    const events = new EventSet();
    let scannedFiles = 0;
    let totalLines = 0;
    let note: string | undefined;

    const { files } = collectFiles([join(this.home, "projects")], (n) => n.endsWith(".jsonl"), opts);
    for (const file of files) {
      scannedFiles++;
      const fallbackMs = mtimeMs(file);
      let session: string | undefined;
      let model: string | undefined;
      let index = 0;
      for (const line of readLines(file)) {
        totalLines++;
        const rec = parseJson(line);
        if (!rec) continue;
        if (!session && typeof rec.sessionId === "string" && rec.sessionId) session = rec.sessionId;
        if (typeof rec.model === "string" && rec.model) model = rec.model.toLowerCase();
        if (rec.role !== "assistant") continue;
        const u = obj(rec.usage) ?? obj(rec.token_usage);
        const tokens = u ? jsonlBuckets(u) : null;
        if (!tokens) continue;
        const m = model ?? UNKNOWN_MODEL;
        const sid = session ?? basename(file, ".jsonl");
        events.add(
          makeEvent(this.name, `${sid}:${index}`, m, mapProvider(undefined, m), tokens, parseRfc3339(rec.timestamp) ?? fallbackMs),
        );
        index++;
      }
    }

    const db = join(this.home, "cli", "db", "db.sqlite");
    if (isFile(db) && shouldRead(mtimeMs(db), opts.since)) {
      scannedFiles++;
      try {
        for (const row of await this.readDb(db)) {
          totalLines++;
          const e = this.rowEvent(row, mtimeMs(db));
          if (e) events.add(e);
        }
      } catch (err) {
        note = err instanceof SqliteUnavailable ? err.message : `db.sqlite unreadable: ${(err as Error).message}`;
      }
    }

    return { source: this.name, events: events.values(), scannedFiles, totalLines, ...(note ? { note } : {}) };
  }

  private async readDb(db: string): Promise<Array<UsageRow & { legacy: boolean }>> {
    const cols = `id, model_id, started_at, completed_at, duration_ms, input_tokens, output_tokens,
      reasoning_tokens, cache_read_input_tokens, cache_creation_input_tokens`;
    const where = `WHERE COALESCE(input_tokens,0) + COALESCE(output_tokens,0) + COALESCE(reasoning_tokens,0)
      + COALESCE(cache_read_input_tokens,0) + COALESCE(cache_creation_input_tokens,0) > 0`;
    try {
      const rows = await querySqlite(db, `SELECT ${cols}, computed_total_tokens FROM model_usage ${where}`);
      return rows.map((r) => ({ ...(r as UsageRow), legacy: false }));
    } catch (err) {
      if (err instanceof SqliteUnavailable) throw err;
      const rows = await querySqlite(db, `SELECT ${cols} FROM model_usage ${where}`);
      return rows.map((r) => ({ ...(r as UsageRow), legacy: true }));
    }
  }

  private rowEvent(row: UsageRow & { legacy: boolean }, fallbackMs: number) {
    if (row.id === undefined || row.id === null) return null;
    const input = nn(toNum(row.input_tokens));
    const output = nn(toNum(row.output_tokens));
    const reasoning = nn(toNum(row.reasoning_tokens));
    const cacheRead = nn(toNum(row.cache_read_input_tokens));
    const cacheWrite = nn(toNum(row.cache_creation_input_tokens));
    const total = toNum(row.computed_total_tokens);
    let netIn: number;
    let netOut: number;
    if (total === undefined && row.legacy) {
      netIn = sub(input, cacheRead + cacheWrite);
      netOut = sub(output, reasoning);
    } else {
      [netIn, netOut] = normalize(input, output, cacheRead, cacheWrite, reasoning, total);
    }

    const started = toNum(row.started_at);
    const completed = toNum(row.completed_at);
    const duration = toNum(row.duration_ms);
    const ts =
      started !== undefined && started > 0
        ? started
        : completed !== undefined
          ? duration !== undefined && duration > 0
            ? completed - duration
            : completed
          : fallbackMs;

    const model = typeof row.model_id === "string" && row.model_id ? row.model_id.toLowerCase() : UNKNOWN_MODEL;
    return makeEvent(
      this.name,
      `zcode-sqlite:${String(row.id)}`,
      model,
      mapProvider(undefined, model),
      { input: netIn, output: netOut + reasoning, cacheRead, cacheWrite },
      ts,
    );
  }
}

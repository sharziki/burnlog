import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";
import { envDir, hashId, isDir, walkFiles } from "./fileutil.js";
import { dbMtimeMs } from "./opencode-schema.js";

/**
 * WorkBuddy (Tencent) adapter — tokscale's `sessions/workbuddy.rs` plus the
 * shared `tencent_buddy.rs` transcript reader.
 *
 * Two sources, in priority order:
 *
 * 1. Detailed transcripts: `<root>/projects/**\/*.jsonl`. One JSON object per
 *    line; usage-bearing lines are completed assistant messages
 *    (`type: "message", role: "assistant"`) and `type: "function_call"`
 *    lines, with usage in `message.usage`, `providerData.usage` or
 *    `providerData.rawUsage` (Anthropic-, OpenAI- and DeepSeek-style field
 *    names all occur). Only the usage object, model, ids and timestamp are
 *    kept — never message text or `cwd`.
 *
 * 2. Aggregate fallback: `<root>/workbuddy.db`, table `session_usage` — one
 *    cumulative `used` count per session, recorded as input. A session that
 *    has detailed transcript rows is NOT also counted from here.
 *
 * Roots: ~/.workbuddy (legacy) and ~/.workbuddy-ai (WorkBuddy 5.5+); both are
 * read because upgraded installs keep old sessions in the legacy tree.
 * Override with BURNLOG_WORKBUDDY_DIR (a single root).
 *
 * Input semantics (tokscale's `input_exclusive`): `cachedMissTokens` is
 * already cache-exclusive. Otherwise input is `input_tokens`/`prompt_tokens`
 * as written, minus cache reads ONLY when the reported total proves the input
 * included them (total == input + output while cache reads > 0).
 */

function roots(): string[] {
  const explicit = envDir("BURNLOG_WORKBUDDY_DIR");
  if (explicit) return [explicit];
  return [join(homedir(), ".workbuddy"), join(homedir(), ".workbuddy-ai")];
}

type Usage = Record<string, unknown>;

const opt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;

function firstOption(u: Usage, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = opt(u[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}
const firstPresent = (u: Usage, keys: string[]): number => Math.max(0, firstOption(u, keys) ?? 0);
function firstPositive(u: Usage, keys: string[]): number {
  for (const k of keys) {
    const v = opt(u[k]);
    if (v !== undefined && v > 0) return v;
  }
  return firstPresent(u, keys);
}

export type BuddyTokens = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number };

/** Port of `BuddyUsage::to_breakdown`; null when every bucket is zero. */
export function buddyBreakdown(u: Usage): BuddyTokens | null {
  const cacheRead = firstPositive(u, [
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "cacheTokens",
    "prompt_cache_hit_tokens",
    "cached_tokens",
  ]);
  const output = firstPresent(u, ["output_tokens", "outputTokens", "completion_tokens"]);
  const cacheWrite = firstPositive(u, [
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
    "cachedWriteTokens",
    "prompt_cache_write_tokens",
  ]);
  const reasoning = firstPresent(u, ["completion_thinking_tokens", "completionThinkingTokens", "reasoningTokens"]);

  let input: number;
  const miss = firstOption(u, ["cachedMissTokens", "cacheMissTokens"]);
  if (miss !== undefined) {
    input = Math.max(0, miss);
  } else {
    input = firstPresent(u, ["input_tokens", "inputTokens", "prompt_tokens"]);
    const total = firstOption(u, ["total_tokens", "totalTokens"]);
    if (total !== undefined) {
      const inclusive = input + output;
      const exclusive = inclusive + cacheRead + cacheWrite + reasoning;
      if (cacheRead > 0 && Math.max(0, total) === inclusive && inclusive !== exclusive) {
        input = Math.max(0, input - cacheRead);
      }
    }
  }

  const t = { input, output, reasoning, cacheRead, cacheWrite };
  return input + output + reasoning + cacheRead + cacheWrite > 0 ? t : null;
}

type Detailed = { key: string; session: string; event: BurnEvent };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const obj = (v: unknown): Usage | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Usage) : undefined;

/** Port of `tencent_buddy::parse_jsonl_file` for one transcript. */
export function parseBuddyJsonl(source: string, defaultModel: string, file: string, text: string, mtimeMs: number): Detailed[] {
  const fallbackSession = basename(file).replace(/\.[^.]*$/, "") || "unknown";
  const byKey = new Map<string, number>();
  const out: Detailed[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let item: Usage;
    try {
      const parsed = JSON.parse(trimmed);
      if (!obj(parsed)) continue;
      item = parsed;
    } catch {
      continue;
    }

    const isAssistant = item.type === "message" && item.role === "assistant";
    const isCall = item.type === "function_call";
    if (!isAssistant && !isCall) continue;
    if (typeof item.status === "string" && item.status !== "completed") continue;

    const message = obj(item.message);
    const pd = obj(item.providerData);
    const usage = obj(message?.usage) ?? obj(pd?.usage) ?? obj(pd?.rawUsage);
    if (!usage) continue;
    const t = buddyBreakdown(usage);
    if (!t) continue;

    const model = [pd?.model, pd?.requestModelId, message?.model]
      .map(str)
      .find((m) => m !== undefined && m.trim() !== "") ?? defaultModel;
    const session = str(item.sessionId) ?? fallbackSession;
    const ts = opt(item.timestamp) ?? mtimeMs;

    const natural = str(pd?.messageId) ?? str(pd?.traceId) ?? str(item.id);
    const key = natural ? `${source}:${session}:${natural}` : `${source}:${hashId(file)}:${out.length}`;

    const event: BurnEvent = {
      requestId: hashId(key),
      source,
      model,
      provider: providerFromModel(model),
      inputTokens: t.input,
      outputTokens: t.output + t.reasoning,
      cacheCreationTokens: t.cacheWrite,
      cacheReadTokens: t.cacheRead,
      timestamp: new Date(ts).toISOString(),
    };
    const total = t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;

    if (natural) {
      const existing = byKey.get(key);
      if (existing !== undefined) {
        const prev = out[existing].event;
        const prevTotal =
          prev.inputTokens + prev.outputTokens + prev.cacheCreationTokens + prev.cacheReadTokens;
        if (total >= prevTotal) out[existing] = { key, session, event };
        continue;
      }
      byKey.set(key, out.length);
    }
    out.push({ key, session, event });
  }
  return out;
}

const FALLBACK_QUERY = `
  SELECT su.session_id AS session_id, su.used AS used, su.updated_at AS updated_at, s.model AS model
  FROM session_usage su
  LEFT JOIN sessions s ON s.id = su.session_id
  WHERE su.used IS NOT NULL AND su.used > 0
    AND su.updated_at IS NOT NULL AND su.updated_at > 0`;

export class WorkbuddyAdapter implements Adapter {
  readonly name = "workbuddy" as const;

  detect(): boolean {
    return roots().some(isDir);
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const rs = roots().filter(isDir);
    if (rs.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    let scannedFiles = 0;
    let totalLines = 0;
    const detailed: Detailed[] = [];
    const detailedSessions = new Set<string>();
    // tokscale walks the root for workbuddy.db; in practice it sits at the root.
    const dbs = rs.map((root) => join(root, "workbuddy.db")).filter((db) => {
      const m = dbMtimeMs(db);
      return m > 0 && shouldRead(m, opts.since);
    });

    for (const root of rs) {
      for (const file of walkFiles(join(root, "projects"), (n) => n.toLowerCase().endsWith(".jsonl"))) {
        let mtime: number;
        try {
          mtime = statSync(file).mtimeMs;
        } catch {
          continue;
        }
        const changed = shouldRead(mtime, opts.since);
        // An unchanged transcript only matters for telling which sessions the
        // aggregate fallback must skip, and only when that db is being read.
        if (!changed && dbs.length === 0) continue;
        let text: string;
        try {
          text = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        const rows = parseBuddyJsonl(this.name, "workbuddy", file, text, mtime);
        for (const r of rows) detailedSessions.add(r.session);
        if (!changed) continue;
        scannedFiles++;
        totalLines += text.split("\n").length;
        detailed.push(...rows);
      }
    }

    const seen = new Set<string>();
    const events: BurnEvent[] = [];
    for (const d of detailed) {
      if (seen.has(d.key)) continue;
      seen.add(d.key);
      events.push(d.event);
    }

    let note: string | undefined;
    for (const db of dbs) {
      let rows: Row[];
      try {
        rows = await querySqlite(db, FALLBACK_QUERY);
      } catch (err) {
        if (err instanceof SqliteUnavailable) note = `workbuddy.db skipped: ${err.message}`;
        continue;
      }
      scannedFiles++;
      totalLines += rows.length;
      for (const r of rows) {
        const session = String(r.session_id ?? "");
        const used = opt(r.used) ?? 0;
        const updated = opt(r.updated_at) ?? 0;
        if (!session || used <= 0 || updated <= 0) continue;
        if (detailedSessions.has(session)) continue;
        const key = `workbuddy:${session}:${updated}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const model = (typeof r.model === "string" && r.model.trim()) || "auto";
        events.push({
          requestId: hashId(key),
          source: this.name,
          model,
          provider: providerFromModel(model),
          inputTokens: used,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          timestamp: new Date(updated > 10_000_000_000 ? updated : updated * 1000).toISOString(),
        });
      }
    }

    return { source: this.name, events, scannedFiles, totalLines, ...(note ? { note } : {}) };
  }
}

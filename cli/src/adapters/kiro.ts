import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, walkFiles } from "./fileutil.js";
import { querySqlite, SqliteUnavailable } from "./sqlite.js";

/**
 * Kiro adapter — ported from tokscale's `sessions/kiro.rs` (the CLI file and
 * SQLite paths).
 *
 * Two local sources:
 *
 *  1. Kiro CLI session files, `~/.kiro/sessions/cli/<id>.json` (same on every
 *     OS) plus a sibling `<id>.jsonl` conversation log. The `.json` header
 *     carries `session_state.conversation_metadata.user_turn_metadatas[]`,
 *     one entry per user turn, and `rts_model_state.model_info`.
 *  2. The Kiro CLI database `conversations_v2` table (`value` is a JSON
 *     conversation with `history[*].request_metadata`), at
 *     `~/.local/share/kiro-cli/data.sqlite3`, else
 *     `~/Library/Application Support/kiro-cli/data.sqlite3` (macOS).
 *
 * Token accounting (tokscale's "hybrid" model, ported exactly): real
 * per-turn counts win when > 0. Kiro's Auto agent persists zeros, so usage is
 * otherwise ESTIMATED at 1 token per 4 bytes:
 *   input      = ceil((user_prompt_length | prompt length) + this turn's
 *                tool-result length) / 4)       — the turn's fresh content
 *   cache_read = max(context_window * context_usage_percentage / 100 - input, 0)
 *   output     = ceil(assistant_response_length | response_size | reply length) / 4)
 * Turns whose resolved input + output is 0 are skipped. Reasoning tokens
 * (SQLite only) are added to output.
 *
 * PRIVACY: where Kiro did not persist a byte length, the text is measured —
 * its length is taken and the text discarded. Nothing but the counts leaves
 * this function; ids are hashed because the CLI session id may be a filename.
 *
 * Not ported: Kiro IDE globalStorage snapshots and `sess_*` IDE session
 * directories. Those carry no usage at all; tokscale reconstructs them by
 * walking every text node of the conversation, which is outside what burnlog
 * is willing to read.
 *
 * Override with BURNLOG_KIRO_DIR (the CLI sessions dir) and BURNLOG_KIRO_DB
 * (the database). Setting only BURNLOG_KIRO_DIR disables the database scan,
 * so a test never reads the real one.
 */

const UNKNOWN_MODEL = "auto";
const DEFAULT_CONTEXT_WINDOW = 200_000;

type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** tokscale's `estimate_tokens`: one token per four characters, rounded up. */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/** A finite number (sign preserved), or undefined. */
function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined;
}
function float(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function obj(v: unknown): Record<string, any> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : undefined;
}
function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}
/** First present value among field aliases (serde `alias`). */
function pick(o: Record<string, any> | undefined, ...keys: string[]): unknown {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function secondsToMs(s: number): number {
  return Math.trunc(s * 1000);
}

function parseTimestampValue(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.abs(v) < 1e12 ? secondsToMs(v) : Math.trunc(v);
  }
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
    }
    const n = Number(v);
    if (v.trim() && Number.isFinite(n)) return secondsToMs(n);
  }
  return undefined;
}

/** Byte length of a tool-result payload: strings count bytes, JSON its compact form. */
function jsonValueLen(v: unknown): number {
  if (typeof v === "string") return byteLen(v);
  if (v === undefined) return 0;
  try {
    return byteLen(JSON.stringify(v) ?? "");
  } catch {
    return 0;
  }
}

/** `ToolResults` jsonl entry: data.content[kind=toolResult].data.content[].data */
function cliToolResultsLen(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const part of content) {
    if (obj(part)?.kind !== "toolResult") continue;
    const inner = obj(part.data)?.content;
    if (!Array.isArray(inner)) continue;
    for (const i of inner) {
      const o = obj(i);
      if (o && "data" in o) total += jsonValueLen(o.data);
    }
  }
  return total;
}

/** Code-point count of text parts (kind absent or "text"). */
function textCharCount(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const part of content) {
    const o = obj(part);
    if (!o) continue;
    if (o.kind !== undefined && o.kind !== null && o.kind !== "text") continue;
    if (typeof o.data === "string") n += [...o.data].length;
  }
  return n;
}

function toEvent(
  source: string,
  key: string,
  model: string,
  t: Tokens,
  timestampMs: number,
): BurnEvent {
  return {
    requestId: hashId("kiro", key),
    source,
    model,
    provider: providerFromModel(model),
    inputTokens: t.input,
    outputTokens: t.output,
    cacheCreationTokens: t.cacheWrite,
    cacheReadTokens: t.cacheRead,
    timestamp: new Date(timestampMs).toISOString(),
  };
}

type MsgContent = { promptChars: number; assistantChars: number; toolResultChars: number; promptTs?: number };

/** Parse one CLI session header (+ sibling .jsonl). Exported for tests. */
export function parseKiroCliFile(path: string, source = "kiro"): BurnEvent[] {
  let header: Record<string, any> | undefined;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
    header = obj(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return [];
  }
  if (!header) return [];

  const sessionId =
    typeof header.session_id === "string" ? header.session_id : basename(path).replace(/\.[^.]*$/, "");
  const state = obj(header.session_state);
  const modelInfo = obj(obj(state?.rts_model_state)?.model_info);
  const model =
    typeof modelInfo?.model_id === "string" && modelInfo.model_id.trim() ? modelInfo.model_id : UNKNOWN_MODEL;
  const cw = int(modelInfo?.context_window_tokens) ?? 0;
  const contextWindow = cw > 0 ? cw : DEFAULT_CONTEXT_WINDOW;
  const turnsRaw = obj(state?.conversation_metadata)?.user_turn_metadatas;
  const turns: unknown[] = Array.isArray(turnsRaw) ? turnsRaw : [];

  // Sibling conversation log: prompt / tool-result lengths are attributed
  // order-based to the following AssistantMessage (their own message_ids do
  // not reliably match the header's).
  const byMessageId = new Map<string, MsgContent>();
  let jsonl = "";
  try {
    jsonl = readFileSync(path.replace(/\.[^./\\]*$/, "") + ".jsonl", "utf8");
  } catch {
    /* no sidecar */
  }
  let pendingPrompt: { chars: number; ts?: number } | undefined;
  let pendingToolChars = 0;
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: Record<string, any> | undefined;
    try {
      entry = obj(JSON.parse(trimmed));
    } catch {
      continue;
    }
    if (!entry) continue;
    if (entry.kind === "ToolResults") {
      pendingToolChars += cliToolResultsLen(obj(entry.data)?.content);
      continue;
    }
    if (typeof entry.kind !== "string") continue;
    const data = obj(entry.data);
    if (!data || typeof data.message_id !== "string") continue;
    const chars = textCharCount(data.content);
    if (entry.kind === "Prompt") {
      const ts = float(obj(data.meta)?.timestamp);
      pendingPrompt = { chars, ts: ts === undefined ? undefined : secondsToMs(ts) };
    } else if (entry.kind === "AssistantMessage") {
      let m = byMessageId.get(data.message_id);
      if (!m) {
        m = { promptChars: 0, assistantChars: 0, toolResultChars: 0 };
        byMessageId.set(data.message_id, m);
      }
      if (pendingPrompt) {
        m.promptChars += pendingPrompt.chars;
        if (m.promptTs === undefined) m.promptTs = pendingPrompt.ts;
        pendingPrompt = undefined;
      }
      m.assistantChars += chars;
      m.toolResultChars += pendingToolChars;
      pendingToolChars = 0;
    }
  }

  const out: BurnEvent[] = [];
  turns.forEach((raw, index) => {
    const turn = obj(raw);
    if (!turn) return;
    let promptChars = 0;
    let assistantChars = 0;
    let toolChars = 0;
    let promptTs: number | undefined;
    const ids = Array.isArray(turn.message_ids) ? turn.message_ids : [];
    for (const id of ids) {
      if (typeof id !== "string") continue;
      const c = byMessageId.get(id);
      if (!c) continue;
      promptChars += c.promptChars;
      assistantChars += c.assistantChars;
      toolChars += c.toolResultChars;
      if (promptTs === undefined) promptTs = c.promptTs;
    }

    const realInput = Math.max(0, int(turn.input_token_count) ?? 0);
    const realOutput = Math.max(0, int(turn.output_token_count) ?? 0);
    const realCacheRead = Math.max(0, int(turn.cache_read_input_token_count) ?? 0);
    const realCacheWrite = Math.max(0, int(turn.cache_write_input_token_count) ?? 0);

    const promptBytes = Math.max(0, int(turn.user_prompt_length) ?? 0);
    const fresh = estimateTokens((promptBytes > 0 ? promptBytes : promptChars) + toolChars);
    const input = realInput > 0 ? realInput : fresh;

    let cacheRead: number;
    if (realCacheRead > 0) cacheRead = realCacheRead;
    else {
      const pct = float(turn.context_usage_percentage) ?? 0;
      const total = pct > 0 ? Math.floor((contextWindow * pct) / 100) : 0;
      cacheRead = Math.max(0, total - input);
    }

    let output: number;
    if (realOutput > 0) output = realOutput;
    else {
      const respBytes = Math.max(0, int(turn.assistant_response_length) ?? 0);
      output = estimateTokens(respBytes > 0 ? respBytes : assistantChars);
    }

    if (input + output === 0) return;
    const ts = promptTs ?? parseTimestampValue(turn.end_timestamp) ?? mtimeMs;
    out.push(
      toEvent(source, `${sessionId}:${index}`, model, { input, output, cacheRead, cacheWrite: realCacheWrite }, ts),
    );
  });
  return out;
}

/** Text length of a `ToolUseResults` payload (`Text`/`text` strings, else compact JSON). */
function dbToolResultsLen(v: unknown): number {
  const walk = (x: unknown): number => {
    if (Array.isArray(x)) return x.reduce((s: number, i) => s + walk(i), 0);
    const o = obj(x);
    if (!o) return 0;
    let n = 0;
    for (const [k, val] of Object.entries(o)) {
      if ((k === "Text" || k === "text") && typeof val === "string") n += byteLen(val);
      else n += walk(val);
    }
    return n;
  };
  const extracted = walk(v);
  return extracted > 0 ? extracted : jsonValueLen(v);
}

/** Convert one conversations_v2 row value into events. Exported for tests. */
export function parseKiroConversation(
  conversationId: string,
  value: string,
  fallbackMs: number,
  source = "kiro",
): BurnEvent[] {
  let conv: Record<string, any> | undefined;
  try {
    conv = obj(JSON.parse(value));
  } catch {
    return [];
  }
  if (!conv) return [];
  const info = obj(conv.model_info);
  const contextWindow = int(info?.context_window_tokens) ?? 0;
  const model = typeof info?.model_id === "string" && info.model_id.trim() ? info.model_id : UNKNOWN_MODEL;
  const history: unknown[] = Array.isArray(conv.history) ? conv.history : [];

  const out: BurnEvent[] = [];
  history.forEach((raw, index) => {
    const turn = obj(raw);
    const meta = obj(turn?.request_metadata);
    if (!turn || !meta) return;
    const nested = obj(pick(meta, "token_usage", "usage"));
    const field = (...keys: string[]): number | undefined => int(pick(meta, ...keys)) ?? int(pick(nested, ...keys));

    const realInput = field("input_tokens", "uncached_input_tokens", "input_token_count");
    const realOutput = field("output_tokens", "output_token_count");
    const cacheReadCount = field("cache_read_input_tokens", "cache_read_tokens", "cache_read");
    const cacheWriteCount = field(
      "cache_write_input_tokens",
      "cache_write_tokens",
      "cache_creation_input_tokens",
      "cache_write",
    );
    const reasoningCount = field("reasoning_tokens", "reasoning_token_count", "thinking_tokens");

    const pct = float(meta.context_usage_percentage) ?? 0;
    const responseSize = Math.max(0, int(meta.response_size) ?? 0);
    const totalContext = contextWindow > 0 && pct > 0 ? Math.floor((contextWindow * pct) / 100) : 0;

    let input: number;
    let hybridCacheRead: number | undefined;
    if (realInput !== undefined && realInput > 0) {
      input = realInput;
    } else {
      const content = obj(obj(turn.user)?.content);
      const promptLen = Math.max(0, int(meta.user_prompt_length) ?? 0);
      const promptText = obj(content?.Prompt)?.prompt;
      const promptPart = promptLen > 0 ? promptLen : typeof promptText === "string" ? byteLen(promptText) : 0;
      const toolPart = content && "ToolUseResults" in content ? dbToolResultsLen(content.ToolUseResults) : 0;
      input = estimateTokens(promptPart + toolPart);
      hybridCacheRead = Math.max(0, totalContext - input);
    }
    const output = realOutput !== undefined && realOutput > 0 ? realOutput : estimateTokens(responseSize);
    const cacheRead = Math.max(
      0,
      cacheReadCount !== undefined && cacheReadCount > 0 ? cacheReadCount : (hybridCacheRead ?? 0),
    );
    const cacheWrite = Math.max(0, cacheWriteCount ?? 0);
    const reasoning = Math.max(0, reasoningCount ?? 0);
    if (input + output === 0) return;

    // tokscale falls back to epoch 0 here; the database mtime is a truer guess.
    const ts = int(meta.request_start_timestamp_ms) ?? int(meta.stream_end_timestamp_ms) ?? fallbackMs;
    out.push(
      toEvent(source, `${conversationId}:${index}`, model, { input, output: output + reasoning, cacheRead, cacheWrite }, ts),
    );
  });
  return out;
}

export class KiroAdapter implements Adapter {
  readonly name = "kiro" as const;

  private get cliRoot(): string {
    return envDir("BURNLOG_KIRO_DIR") ?? join(homedir(), ".kiro", "sessions", "cli");
  }

  private get dbPath(): string | null {
    const explicit = envDir("BURNLOG_KIRO_DB");
    if (explicit) return explicit;
    if (envDir("BURNLOG_KIRO_DIR")) return null;
    const home = homedir();
    const candidates = [
      join(home, ".local", "share", "kiro-cli", "data.sqlite3"),
      join(home, "Library", "Application Support", "kiro-cli", "data.sqlite3"),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  detect(): boolean {
    const db = this.dbPath;
    return existsSync(this.cliRoot) || (db !== null && existsSync(db));
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const byId = new Map<string, BurnEvent>();
    const add = (e: BurnEvent) => {
      if (!byId.has(e.requestId)) byId.set(e.requestId, e);
    };
    let scannedFiles = 0;
    let totalLines = 0;
    const notes: string[] = [];

    if (existsSync(this.cliRoot)) {
      const files = walkFiles(this.cliRoot, (n) => n.endsWith(".json")).filter(
        // IDE `sess_*/session.json` layout is not this format.
        (f) => !(basename(f) === "session.json" && basename(dirname(f)).startsWith("sess_")),
      );
      for (const f of files) {
        let mtime: number;
        try {
          mtime = statSync(f).mtimeMs;
          // The header is rewritten each turn, but the sidecar may be newer.
          const side = f.replace(/\.[^./\\]*$/, "") + ".jsonl";
          if (existsSync(side)) mtime = Math.max(mtime, statSync(side).mtimeMs);
        } catch {
          continue;
        }
        if (!shouldRead(mtime, opts.since)) continue;
        scannedFiles++;
        const events = parseKiroCliFile(f, this.name);
        totalLines += events.length;
        events.forEach(add);
      }
    }

    const db = this.dbPath;
    if (db && existsSync(db)) {
      try {
        const mtime = statSync(db).mtimeMs;
        if (shouldRead(mtime, opts.since)) {
          const rows = await querySqlite(db, "SELECT conversation_id, value FROM conversations_v2");
          scannedFiles++;
          for (const r of rows) {
            totalLines++;
            if (typeof r.conversation_id !== "string" || typeof r.value !== "string") continue;
            parseKiroConversation(r.conversation_id, r.value, mtime, this.name).forEach(add);
          }
        }
      } catch (err) {
        notes.push(err instanceof SqliteUnavailable ? err.message : "could not read the Kiro CLI database");
      }
    }

    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles,
      totalLines,
      ...(notes.length ? { note: notes.join("; ") } : {}),
    };
  }
}

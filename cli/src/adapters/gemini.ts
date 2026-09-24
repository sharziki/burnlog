import { existsSync, readFileSync, statSync } from "fs";
import { basename, extname, join, sep } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { envDir, envOrHome, hashId, toMs, walkFiles } from "./fileutil.js";

/**
 * Gemini CLI adapter (ported from tokscale's `sessions/gemini.rs`).
 *
 * Gemini CLI records chats under its home (`$GEMINI_CLI_HOME`, default
 * `~/.gemini` on Linux, macOS and Windows alike):
 *
 *   <home>/tmp/<projectHash>/chats/session-<ts>-<id>.json    (chat recording)
 *   <home>/tmp/<projectHash>/chats/session-<id>.jsonl        (newer, streamed)
 *
 * Plus any `*.jsonl` / `*.json` headless output (`gemini -p --output-format
 * json|stream-json`) saved under `tmp/`. Three shapes carry usage:
 *
 * 1. Chat recording: `{ sessionId, projectHash, startTime, lastUpdated,
 *    messages: [{ id, timestamp, type, model, tokens: { input, output,
 *    cached, thoughts, tool, total } }] }`.
 * 2. Direct token lines: `{ type: "gemini", id, model, tokens: {...} }` —
 *    a later line with the same id replaces the earlier one.
 * 3. Headless stats: `{ stats: { models: { <model>: { tokens: { prompt,
 *    candidates, cached, thoughts } } } } }` or flat `stats.input_tokens`.
 *
 * Gemini's prompt count INCLUDES cached tokens. For chat recordings the
 * cached share is subtracted only when the recorded `total` proves input was
 * inclusive (total == input+output+thoughts+tool); headless `prompt` /
 * `input_tokens` are always inclusive. `tool` tokens count as input and
 * `thoughts` are billed output, so they are added to output here.
 *
 * A `.json` not named `session-*` is only read when it sits exactly at
 * `tmp/<hash>/chats/<file>` — Gemini keeps unrelated JSON (logs, backups)
 * elsewhere under `tmp/`.
 *
 * Override the Gemini home with BURNLOG_GEMINI_DIR.
 */

type Json = Record<string, unknown>;

type Usage = { model: string; input: number; output: number; cacheRead: number; key?: string; ts?: number };

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** tokscale's `extract_i64`: integers or integer strings, else undefined. */
function int(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return undefined;
}

function first(obj: Json, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = int(obj[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function geminiHome(): string {
  return envDir("BURNLOG_GEMINI_DIR") ?? envOrHome("GEMINI_CLI_HOME", ".gemini");
}

/** Chat-recording / direct-line token object → additive buckets. */
function directUsage(model: string, tokens: Json): Usage {
  const input = Math.max(0, first(tokens, ["input", "prompt", "input_tokens", "prompt_tokens", "promptTokenCount"]) ?? 0);
  const output = Math.max(0, first(tokens, ["output", "candidates", "output_tokens", "completion_tokens", "candidatesTokenCount"]) ?? 0);
  const cached = Math.max(0, first(tokens, ["cached", "cached_tokens", "cachedContentTokenCount"]) ?? 0);
  const thoughts = Math.max(0, first(tokens, ["thoughts", "reasoning", "thoughts_tokens"]) ?? 0);
  const tool = Math.max(0, first(tokens, ["tool", "tool_tokens"]) ?? 0);
  const totalRaw = first(tokens, ["total", "totalTokenCount", "total_tokens"]);

  let net = input;
  if (totalRaw !== undefined) {
    const total = Math.max(0, totalRaw);
    const inclusive = input + output + thoughts + tool;
    if (cached > 0 && total === inclusive && total !== inclusive + cached) net = input - Math.min(cached, input);
  }
  return { model, input: net + tool, output: output + thoughts, cacheRead: cached };
}

/** Headless `stats` value → one usage per model. */
function statsUsages(stats: Json, modelHint: string | undefined): Usage[] {
  const out: Usage[] = [];
  const models = stats.models;
  if (isObj(models)) {
    for (const [model, data] of Object.entries(models)) {
      if (!isObj(data)) continue;
      const u = statsUsage(model, data);
      if (u) out.push(u);
    }
    if (out.length) return out;
  }
  const u = statsUsage(modelHint ?? "unknown", stats);
  return u ? [u] : [];
}

function statsUsage(model: string, value: Json): Usage | null {
  const hasWrapper = isObj(value.tokens);
  const t = hasWrapper ? (value.tokens as Json) : value;
  const prompt = int(t.prompt) ?? int(t.input_tokens) ?? int(t.prompt_tokens);
  const netInput = int(t.input);
  const wrapperInput = hasWrapper ? netInput : undefined;
  const input = prompt ?? wrapperInput ?? netInput ?? 0;
  const output = int(t.candidates) ?? int(t.output) ?? int(t.output_tokens) ?? int(t.candidates_tokens) ?? 0;
  const cached = int(t.cached) ?? int(t.cached_tokens) ?? 0;
  const reasoning = int(t.thoughts) ?? int(t.thoughts_tokens) ?? int(t.reasoning) ?? int(t.reasoning_tokens) ?? 0;
  if (input === 0 && output === 0 && cached === 0 && reasoning === 0) return null;

  const includesCache = prompt !== undefined || wrapperInput !== undefined || netInput === undefined;
  const i = Math.max(0, input);
  const c = Math.max(0, cached);
  const net = includesCache ? i - Math.min(c, i) : i;
  return { model, input: net, output: Math.max(0, output) + Math.max(0, reasoning), cacheRead: c };
}

function valueTimestamp(v: Json): number | undefined {
  const t = v.timestamp ?? v.created_at;
  if (typeof t === "number" && t <= 0) return undefined;
  return toMs(t);
}

function statsOf(v: Json): Json | undefined {
  if (isObj(v.stats)) return v.stats;
  if (isObj(v.result) && isObj((v.result as Json).stats)) return (v.result as Json).stats as Json;
  return undefined;
}

/** Streamed / headless JSONL. */
function parseJsonl(content: string, stem: string, fallback: number, fileKey: string): Usage[] {
  let sessionId = stem;
  let currentModel: string | undefined;
  const out: Usage[] = [];
  const directIndex = new Map<string, number>();

  content.split("\n").forEach((raw, lineNo) => {
    const line = raw.trim();
    if (!line) return;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      return;
    }
    if (!isObj(v)) return;
    const type = str(v.type) ?? "";
    const sid = str(v.session_id) ?? str(v.sessionId);
    if (type === "init") {
      if (str(v.model)) currentModel = str(v.model);
      if (sid) sessionId = sid;
      return;
    }
    if (sid) sessionId = sid;

    if (type === "gemini" || v.tokens !== undefined) {
      if (str(v.model)) currentModel = str(v.model);
      const model = str(v.model) ?? currentModel;
      if (model && isObj(v.tokens)) {
        const u = directUsage(model, v.tokens);
        u.ts = valueTimestamp(v) ?? fallback;
        const id = str(v.id);
        if (id) {
          u.key = `gemini:${sessionId}:${id}`;
          const at = directIndex.get(id);
          if (at !== undefined) out[at] = u;
          else {
            directIndex.set(id, out.length);
            out.push(u);
          }
        } else {
          u.key = `gemini-line:${fileKey}:${lineNo}`;
          out.push(u);
        }
      }
      return;
    }

    const stats = statsOf(v);
    if (stats) {
      const ts = valueTimestamp(v) ?? fallback;
      statsUsages(stats, currentModel).forEach((u, i) => {
        u.ts = ts;
        u.key = `gemini-stats:${fileKey}:${lineNo}:${i}`;
        out.push(u);
      });
    }
  });
  return out;
}

/** True when `file` sits exactly at `.../tmp/<x>/chats/<file>`. */
function inChatsDir(file: string): boolean {
  const parts = file.split(/[\\/]/);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "tmp") {
      const after = parts.slice(i + 1);
      if (after.length === 3 && after[1] === "chats") return true;
    }
  }
  return false;
}

export function parseGeminiFile(file: string, content: string, fallback: number): Usage[] {
  const stem = basename(file, extname(file));
  const fileKey = hashId(file);
  if (extname(file) === ".jsonl") return parseJsonl(content, stem, fallback, fileKey);
  if (!basename(file).startsWith("session-") && !inChatsDir(file)) return [];

  let v: unknown;
  try {
    v = JSON.parse(content);
  } catch {
    return parseJsonl(content, stem, fallback, fileKey);
  }
  if (!isObj(v)) return [];

  // Chat recording.
  if (
    typeof v.sessionId === "string" &&
    typeof v.projectHash === "string" &&
    typeof v.startTime === "string" &&
    typeof v.lastUpdated === "string" &&
    Array.isArray(v.messages)
  ) {
    const sessionId = v.sessionId;
    const out: Usage[] = [];
    (v.messages as unknown[]).forEach((m, i) => {
      if (!isObj(m) || !isObj(m.tokens) || typeof m.model !== "string") return;
      const u = directUsage(m.model, m.tokens);
      const t = typeof m.timestamp === "string" ? Date.parse(m.timestamp) : NaN;
      u.ts = Number.isFinite(t) ? t : fallback;
      u.key = `gemini:${sessionId}:${typeof m.id === "string" ? m.id : `#${i}`}`;
      out.push(u);
    });
    return out;
  }

  // Single headless JSON result.
  if (v.type === "gemini" || v.tokens !== undefined) {
    const model = str(v.model);
    if (model && isObj(v.tokens)) {
      const u = directUsage(model, v.tokens);
      u.ts = valueTimestamp(v) ?? fallback;
      u.key = str(v.id) ? `gemini:${stem}:${v.id}` : `gemini-file:${fileKey}`;
      return [u];
    }
  }
  const stats = statsOf(v);
  if (stats) {
    const ts = valueTimestamp(v) ?? fallback;
    return statsUsages(stats, str(v.model)).map((u, i) => ({ ...u, ts, key: `gemini-stats:${fileKey}:0:${i}` }));
  }
  return [];
}

export class GeminiAdapter implements Adapter {
  readonly name = "gemini" as const;

  private get tmpDir(): string {
    return join(geminiHome(), "tmp");
  }

  detect(): boolean {
    return existsSync(this.tmpDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = this.tmpDir;
    if (!existsSync(root)) {
      const note = existsSync(geminiHome())
        ? "installed, but no chat history yet — run a Gemini CLI session first"
        : "not installed";
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note };
    }

    const files = walkFiles(root, (n) => n.endsWith(".json") || n.endsWith(".jsonl"));
    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const file of files) {
      let mtimeMs: number;
      let content: string;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        content = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      } catch {
        continue;
      }
      scannedFiles++;
      totalLines += content.split("\n").length;

      for (const u of parseGeminiFile(file, content, Math.round(mtimeMs))) {
        if (u.input + u.output + u.cacheRead === 0) continue;
        const requestId = hashId(u.key ?? `${file}${sep}${u.ts}`);
        const event: BurnEvent = {
          requestId,
          source: this.name,
          model: u.model,
          // tokscale attributes every Gemini CLI row to Google.
          provider: "google",
          inputTokens: u.input,
          outputTokens: u.output,
          cacheCreationTokens: 0,
          cacheReadTokens: u.cacheRead,
          timestamp: new Date(u.ts ?? mtimeMs).toISOString(),
        };
        // The same session can be recorded as both .json and .jsonl; keep the
        // richest copy of each (session, message) id.
        const prev = byKey.get(requestId);
        if (!prev || event.inputTokens + event.outputTokens + event.cacheReadTokens > prev.inputTokens + prev.outputTokens + prev.cacheReadTokens) {
          byKey.set(requestId, event);
        }
      }
    }

    return { source: this.name, events: [...byKey.values()], scannedFiles, totalLines };
  }
}

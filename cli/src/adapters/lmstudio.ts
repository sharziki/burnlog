import { closeSync, openSync, readSync, statSync } from "fs";
import { join } from "path";
import { StringDecoder } from "string_decoder";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { envDir, envOrHome, hashId, isDir, num, walkFiles } from "./fileutil.js";

/**
 * LM Studio adapter — the local OpenAI-compatible server's logs.
 *
 * LM Studio's server writes every request and final response, pretty-printed,
 * into nested monthly logs:
 *
 *   ~/.lmstudio/server-logs/<YYYY-MM>/<date>.log      ($LM_STUDIO_HOME honoured)
 *
 * Each final response looks like
 *
 *   [2026-07-09 10:00:00][INFO][model] Final response: { "id": "chatcmpl-…",
 *     "model": "…", "choices": [...], "usage": { prompt_tokens, … } }
 *
 * PRIVACY: these logs hold full prompts and completions. Nothing is
 * JSON-parsed except the balanced `usage` object itself; the response id,
 * model and header timestamp are lifted out of the bytes just before it with
 * targeted scans (ported from tokscale's `sessions/lmstudio.rs`). No body text
 * is ever kept.
 *
 * Logs are never rotated and grow without bound, so a file is streamed
 * through a bounded window; a response too long for the window keeps the
 * identity (id/model/time) read from its header on the way out.
 *
 * Token semantics (tokscale): cache read/write are clamped into the prompt,
 * fresh input = max(total, prompt+completion) − completion − cache; output is
 * the whole completion (reasoning is part of it). Local inference, so the
 * provider is always "other".
 *
 * Override the LM Studio home with BURNLOG_LMSTUDIO_DIR (or LM_STUDIO_HOME).
 */

const WINDOW_CHARS = 8 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const IDENTITY_OVERLAP = 512;
const USAGE_MARKER = '"usage"';

function lmstudioHome(): string {
  return envDir("BURNLOG_LMSTUDIO_DIR") ?? envOrHome("LM_STUDIO_HOME", ".lmstudio");
}

const isWs = (c: string | undefined): boolean => c === " " || c === "\n" || c === "\r" || c === "\t";

function skipWs(s: string, i: number): number {
  while (i < s.length && isWs(s[i])) i++;
  return i;
}

/**
 * Next `"usage": {` at or after `from`. `certain` is the first offset that
 * might still begin a match once more bytes arrive.
 */
function scanUsageStart(s: string, from: number): { found?: { marker: number; brace: number }; certain: number } {
  let cursor = from;
  for (;;) {
    const marker = s.indexOf(USAGE_MARKER, cursor);
    if (marker < 0) break;
    cursor = marker + USAGE_MARKER.length;
    if (marker > 0 && s[marker - 1] === "\\") continue;
    const colon = skipWs(s, cursor);
    if (colon >= s.length) return { certain: marker };
    if (s[colon] !== ":") continue;
    const brace = skipWs(s, colon + 1);
    if (brace >= s.length) return { certain: marker };
    if (s[brace] === "{") return { found: { marker, brace }, certain: marker };
  }
  return { certain: Math.max(0, s.length - (USAGE_MARKER.length - 1)) };
}

function balancedEnd(s: string, start: number): number {
  if (s[start] !== "{") return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function stringEnd(s: string, start: number): number {
  if (s[start] !== '"') return -1;
  let esc = false;
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') return i + 1;
  }
  return -1;
}

/** Last `"field": "<string>"` in `s` that is not itself inside an escaped string. */
function lastStringField(s: string, field: string): string | undefined {
  const marker = `"${field}"`;
  let cursor = 0;
  let found: string | undefined;
  for (;;) {
    const idx = s.indexOf(marker, cursor);
    if (idx < 0) break;
    cursor = idx + marker.length;
    if (idx > 0 && s[idx - 1] === "\\") continue;
    let v = skipWs(s, cursor);
    if (s[v] !== ":") continue;
    v = skipWs(s, v + 1);
    const end = stringEnd(s, v);
    if (end < 0) continue;
    try {
      const parsed = JSON.parse(s.slice(v, end));
      if (typeof parsed === "string") found = parsed;
    } catch {
      // not a string literal
    }
  }
  return found;
}

function responseIdIn(s: string): string | undefined {
  const v = lastStringField(s, "id");
  return v && ["chatcmpl-", "cmpl-", "resp_"].some((p) => v.startsWith(p)) ? v : undefined;
}

function modelIn(s: string): string | undefined {
  const v = lastStringField(s, "model");
  return v && v.trim() ? v : undefined;
}

/**
 * Timestamp of the last log header (`[YYYY-MM-DD HH:MM:SS][` at line start),
 * in local time. Anchored to the header shape so a date the model printed in
 * its answer never dates the usage.
 */
function lastLogTimestamp(s: string): number | undefined {
  let parsed: number | undefined;
  const re = /(?:^|\n)\r?\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\]\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
    const t = new Date(y, mo - 1, d, h, mi, se).getTime();
    if (Number.isFinite(t)) parsed = t;
    re.lastIndex = m.index + 1;
  }
  return parsed;
}

type Usage = Record<string, unknown>;

function pick(o: Usage | undefined, ...keys: string[]): number {
  if (!o) return 0;
  for (const k of keys) if (o[k] !== undefined) return num(o[k]);
  return 0;
}

function obj(v: unknown): Usage | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Usage) : undefined;
}

export type LmTokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** tokscale's `normalized_tokens`; output keeps reasoning (burnlog convention). */
export function normalizeUsage(u: Usage): LmTokens | null {
  const prompt = pick(u, "prompt_tokens", "promptTokens", "input_tokens", "inputTokens");
  const output = pick(u, "completion_tokens", "completionTokens", "output_tokens", "outputTokens");
  const total = Math.max(pick(u, "total_tokens", "totalTokens"), prompt + output);
  const details = obj(u.prompt_tokens_details ?? u.input_tokens_details ?? u.inputTokensDetails);
  const cacheRead = Math.min(
    Math.max(pick(details, "cached_tokens", "cache_read_tokens"), pick(u, "cached_tokens")),
    prompt,
  );
  const cacheWrite = Math.min(
    Math.max(pick(details, "cache_creation_input_tokens", "cache_write_tokens"), pick(u, "cache_creation_input_tokens")),
    Math.max(0, prompt - cacheRead),
  );
  if (total === 0) return null;
  return { input: Math.max(0, total - output - cacheRead - cacheWrite), output, cacheRead, cacheWrite };
}

type Identity = { id?: string; model?: string; ts?: number };

/** Parse one server log. Window/chunk are parameters only so tests can shrink them. */
export function parseLmstudioFile(path: string, windowChars = WINDOW_CHARS, chunkBytes = CHUNK_BYTES): BurnEvent[] {
  let fd: number;
  let mtime: number;
  try {
    fd = openSync(path, "r");
    mtime = statSync(path).mtimeMs;
  } catch {
    return [];
  }
  const out: BurnEvent[] = [];
  const decoder = new StringDecoder("utf8");
  const chunk = Buffer.alloc(Math.max(1, chunkBytes));
  let win = "";
  let winStart = 0;
  let metaStart = 0;
  let scanned = 0;
  let carried: Identity = {};

  const emit = (usageJson: string, meta: string, marker: number): void => {
    let usage: Usage | undefined;
    try {
      usage = obj(JSON.parse(usageJson));
    } catch {
      return;
    }
    if (!usage) return;
    const t = normalizeUsage(usage);
    if (!t) return;
    const id = responseIdIn(meta) ?? carried.id;
    const model = modelIn(meta) ?? carried.model ?? "unknown";
    const ts = lastLogTimestamp(meta) ?? carried.ts ?? mtime;
    if (!(ts > 0)) return;
    out.push({
      requestId: id
        ? `lmstudio:${id}`
        : `lmstudio:${hashId(path, marker, model, t.input, t.output, t.cacheRead, t.cacheWrite)}`,
      source: "lmstudio",
      model,
      provider: "other",
      inputTokens: t.input,
      outputTokens: t.output,
      cacheCreationTokens: t.cacheWrite,
      cacheReadTokens: t.cacheRead,
      timestamp: new Date(ts).toISOString(),
    });
  };

  try {
    for (;;) {
      let read = 0;
      try {
        read = readSync(fd, chunk, 0, chunk.length, null);
      } catch {
        read = 0;
      }
      const atEof = read === 0;
      win += atEof ? decoder.end() : decoder.write(chunk.subarray(0, read));

      for (;;) {
        const from = Math.min(Math.max(0, scanned - winStart), win.length);
        const { found, certain } = scanUsageStart(win, from);
        if (!found) {
          scanned = winStart + certain;
          break;
        }
        const end = balancedEnd(win, found.brace);
        if (end < 0) {
          scanned = atEof ? winStart + win.length : winStart + found.marker;
          break;
        }
        scanned = winStart + end;
        const metaFrom = Math.min(Math.max(0, metaStart - winStart), found.marker);
        emit(win.slice(found.brace, end), win.slice(metaFrom, found.marker), winStart + found.marker);
        metaStart = winStart + end;
        carried = {};
      }

      const keep = Math.min(Math.max(metaStart, winStart) - winStart, win.length);
      if (keep > 0) {
        win = win.slice(keep);
        winStart += keep;
      }
      if (win.length > windowChars) {
        const overflow = win.length - windowChars;
        const evicted = win.slice(0, Math.min(win.length, overflow + IDENTITY_OVERLAP));
        const id = responseIdIn(evicted);
        const model = modelIn(evicted);
        const ts = lastLogTimestamp(evicted);
        if (id) carried.id = id;
        if (model) carried.model = model;
        if (ts !== undefined) carried.ts = ts;
        win = win.slice(overflow);
        winStart += overflow;
        metaStart = Math.max(metaStart, winStart);
        scanned = Math.max(scanned, winStart);
      }
      if (atEof) break;
    }
  } finally {
    closeSync(fd);
  }
  return out;
}

export class LmstudioAdapter implements Adapter {
  readonly name = "lmstudio" as const;

  private get logsDir(): string {
    return join(lmstudioHome(), "server-logs");
  }

  detect(): boolean {
    return isDir(this.logsDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const dir = this.logsDir;
    if (!isDir(dir)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    for (const file of walkFiles(dir, (n) => n.endsWith(".log"))) {
      try {
        if (!shouldRead(statSync(file).mtimeMs, opts.since)) continue;
      } catch {
        continue;
      }
      scannedFiles++;
      // The same response id in a mirrored/copied log is one request.
      for (const e of parseLmstudioFile(file)) if (!byId.has(e.requestId)) byId.set(e.requestId, e);
    }
    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles,
      totalLines: byId.size,
      ...(scannedFiles === 0 && !opts.since ? { note: "installed, but no server logs yet" } : {}),
    };
  }
}

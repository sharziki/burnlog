import { appendFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { BurnEvent } from "./adapters/types.js";

/**
 * The open event sink: `~/.burnlog/events/YYYY-MM-DD.jsonl`.
 *
 * `burnlog wrap` writes here, and so can anything else — a shell script, a
 * CI job, a language we don't ship an SDK for. Append one JSON object per
 * line and `burnlog sync` will pick it up. This is the extension point that
 * means supporting a new tool never requires a burnlog release.
 *
 * Writing is decoupled from uploading on purpose: a wrapped command must
 * keep working with no network and no API key.
 */

export function sinkDir(): string {
  return process.env.BURNLOG_EVENTS_DIR ?? join(homedir(), ".burnlog", "events");
}

export function appendEvent(event: BurnEvent): void {
  const dir = sinkDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const day = event.timestamp.slice(0, 10);
  appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify(event) + "\n", { mode: 0o600 });
}

/** Files older than this are pruned after a successful sync. */
const RETAIN_DAYS = 30;

export function pruneSink(retainDays = RETAIN_DAYS): number {
  const dir = sinkDir();
  if (!existsSync(dir)) return 0;
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const file of readdirSync(dir)) {
    const match = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file);
    if (!match) continue;
    if (Date.parse(match[1] + "T00:00:00Z") >= cutoff) continue;
    try {
      unlinkSync(join(dir, file));
      removed++;
    } catch {
      // Best effort — a locked file just gets pruned next run.
    }
  }
  return removed;
}

/** Read every event in the sink. Malformed lines are skipped, not fatal. */
export function readSink(): { events: BurnEvent[]; files: number; lines: number } {
  const dir = sinkDir();
  if (!existsSync(dir)) return { events: [], files: 0, lines: 0 };

  const events: BurnEvent[] = [];
  let files = 0;
  let lines = 0;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    let content: string;
    try {
      content = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    files++;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      lines++;
      const event = normalize(line);
      if (event) events.push(event);
    }
  }
  return { events, files, lines };
}

/**
 * Accept a forgiving hand-written shape and produce a valid BurnEvent.
 * Anyone appending to the sink by hand shouldn't have to get every field
 * exactly right — only tokens and a timestamp genuinely matter.
 */
function normalize(line: string): BurnEvent | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  const n = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;

  const input = n(raw.inputTokens ?? raw.input_tokens ?? raw.prompt_tokens);
  const output = n(raw.outputTokens ?? raw.output_tokens ?? raw.completion_tokens);
  const cacheCreate = n(raw.cacheCreationTokens ?? raw.cache_creation_input_tokens);
  const cacheRead = n(raw.cacheReadTokens ?? raw.cache_read_input_tokens ?? raw.cached_tokens);
  if (input + output + cacheCreate + cacheRead === 0) return null;

  const timestamp =
    typeof raw.timestamp === "string" && !Number.isNaN(Date.parse(raw.timestamp))
      ? raw.timestamp
      : new Date().toISOString();

  const model = typeof raw.model === "string" ? raw.model : "unknown";
  const source =
    typeof raw.source === "string" && /^[a-z0-9-]{1,32}$/.test(raw.source) ? raw.source : "jsonl";

  const providerRaw = typeof raw.provider === "string" ? raw.provider : "";
  const provider = (["anthropic", "openai", "google", "other"] as const).includes(
    providerRaw as "other",
  )
    ? (providerRaw as BurnEvent["provider"])
    : "other";

  // A stable id keeps re-syncs idempotent; fall back to a content hash of the
  // line so a re-read of the same file never double-counts.
  const requestId =
    typeof raw.requestId === "string" && raw.requestId
      ? raw.requestId.slice(0, 200)
      : `sink-${hash(line)}`;

  return {
    requestId,
    source,
    model,
    provider,
    inputTokens: input,
    outputTokens: output,
    cacheCreationTokens: cacheCreate,
    cacheReadTokens: cacheRead,
    timestamp,
  };
}

/** Small non-cryptographic hash — only needs to be stable and collision-shy. */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

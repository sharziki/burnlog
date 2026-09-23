/**
 * A single burn event as reported by an adapter.
 *
 * PRIVACY: Intentionally does NOT carry project, cwd, prompt text, filenames,
 * sessionId, or anything else that could identify what the user was working on.
 * Only tokens + model + opaque random dedupe id.
 */
export type BurnEvent = {
  /** Random opaque id from the source CLI, unique within that source. */
  requestId: string;
  /** Which adapter produced this event. */
  source: AdapterName;
  /** Model name as reported by the source CLI. */
  model: string;
  /** Inferred from model name. */
  provider: "anthropic" | "openai" | "google" | "other";
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** ISO timestamp string. */
  timestamp: string;
};

/**
 * Sources burnlog ships with. `proxy` is `burnlog wrap` (any provider),
 * `jsonl` is the open sink any tool can append to. The server accepts any
 * `[a-z0-9-]{1,32}` tag, so community adapters don't need a release here —
 * hence the open string union.
 */
export type KnownAdapter =
  | "claude-code"
  | "codex"
  | "hermes"
  | "openclaw"
  | "opencode"
  | "proxy"
  | "jsonl";

export type AdapterName = KnownAdapter | (string & {});

export type ScanResult = {
  source: AdapterName;
  events: BurnEvent[];
  scannedFiles: number;
  totalLines: number;
  /** Human-readable note about what happened (e.g. "not installed", "stub"). */
  note?: string;
};

export type ScanOptions = {
  /**
   * Skip files not modified since this time.
   *
   * A full scan re-reads every log a user has ever produced — thousands of
   * files — on every single sync. That made the Claude Code session-end hook
   * slow enough to be killed mid-run. Adapters that read files should honour
   * this; dedupe on the server means re-reading is only ever wasted work,
   * never wrong, so ignoring it is safe but slow.
   *
   * Deliberately compared against file mtime with a safety margin, because a
   * log being appended to right as we sync must not be skipped next time.
   */
  since?: Date;
};

export interface Adapter {
  readonly name: AdapterName;
  /** True if this source appears to exist on disk. */
  detect(): boolean;
  /**
   * Parse available history into burn events. Most adapters read files and
   * return synchronously; the few that must ask an API (Cursor keeps usage on
   * its servers) return a promise.
   */
  scan(opts?: ScanOptions): ScanResult | Promise<ScanResult>;
}

/**
 * How far before `since` to still consider a file worth re-reading.
 * Covers clock skew and a file appended to during the previous sync.
 */
export const INCREMENTAL_MARGIN_MS = 10 * 60 * 1000;

/** Should this file be read, given the incremental window? */
export function shouldRead(mtimeMs: number, since?: Date): boolean {
  if (!since) return true;
  return mtimeMs >= since.getTime() - INCREMENTAL_MARGIN_MS;
}

export function providerFromModel(model: string): BurnEvent["provider"] {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4") || m.startsWith("codex"))
    return "openai";
  if (m.includes("gemini")) return "google";
  return "other";
}

/**
 * The ranked total, which leaves cache reads out.
 *
 * Cache reads are 95-99% of a real agent account's raw sum — every turn
 * re-reads the whole cached prompt — so counting them made the leaderboard a
 * measure of session length rather than work. They are still parsed, still
 * uploaded in `cacheReadTokens`, and still priced (at a tenth of fresh input)
 * in the cost estimate; they just don't decide rank.
 *
 * The server recomputes this the same way and does not trust the payload, so
 * an older CLI reports the same number the site does. This keeps `scan` and
 * `sync` output agreeing with the board locally.
 */
export function totalTokens(e: BurnEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens;
}

/** Every token the model actually moved, cache reads included. */
export function grossTokens(e: BurnEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

/**
 * The server stores token counts in Postgres INT4, so an event above this
 * can't be written. Session-aggregating adapters (codex, hermes) roll up
 * thousands of calls into one event and can genuinely exceed it.
 */
export const MAX_EVENT_TOKENS = 2_147_483_647;

/**
 * Split an event whose totals exceed the storage ceiling into parts that fit.
 *
 * The event is already a synthetic aggregate of a whole session, so dividing
 * that aggregate changes nothing about what's being reported — the sum is
 * preserved exactly, including the remainder. Ids get a deterministic `#n`
 * suffix so re-syncing stays idempotent.
 *
 * Without this the server rejects the event and those tokens are lost
 * silently; before the server was fixed, it took the entire batch with it.
 */
export function splitOversized(event: BurnEvent): BurnEvent[] {
  const total = totalTokens(event);
  if (total <= MAX_EVENT_TOKENS) return [event];

  const parts = Math.ceil(total / MAX_EVENT_TOKENS);
  const out: BurnEvent[] = [];

  // Divide each bucket, giving the remainder to the first part so the parts
  // sum to exactly the original.
  const share = (value: number, index: number): number => {
    const base = Math.floor(value / parts);
    return index === 0 ? base + (value - base * parts) : base;
  };

  for (let i = 0; i < parts; i++) {
    out.push({
      ...event,
      requestId: `${event.requestId}#${i + 1}`,
      inputTokens: share(event.inputTokens, i),
      outputTokens: share(event.outputTokens, i),
      cacheCreationTokens: share(event.cacheCreationTokens, i),
      cacheReadTokens: share(event.cacheReadTokens, i),
    });
  }
  return out;
}

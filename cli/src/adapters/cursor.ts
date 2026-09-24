import { createHash } from "crypto";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { querySqlite } from "./sqlite.js";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel } from "./types.js";

/**
 * Cursor adapter.
 *
 * Cursor keeps no per-request usage on disk; it lives on cursor.com. This
 * adapter does what the Cursor dashboard does (ported from tokscale, MIT):
 *
 *   1. Read `cursorAuth/accessToken` from Cursor's own `state.vscdb`
 *      (read-only). Override the path with BURNLOG_CURSOR_STATE_DB.
 *   2. Build the `WorkosCursorSessionToken` cookie (`{user_id}%3A%3A{jwt}`,
 *      user id taken from the JWT `sub` claim).
 *   3. POST https://cursor.com/api/dashboard/get-filtered-usage-events,
 *      500 events per page, until `totalUsageEventsCount` is reached.
 *
 * PRIVACY: the Cursor access token is read from Cursor's database into memory
 * for this one scan and sent only to cursor.com, as the session cookie. It is
 * never logged, never written to disk by burnlog, never cached, and never sent
 * to burnlog's servers. What leaves this adapter is the same thing every other
 * adapter emits: model, token counts, timestamp and an opaque hashed id.
 * Conversation ids are only ever an input to that hash.
 *
 * Every event is counted whether or not Cursor charged for it — plan-included
 * usage is the bulk of what a subscriber burns.
 */

const ENDPOINT = "https://cursor.com/api/dashboard/get-filtered-usage-events";
const PAGE_SIZE = 500;
const MAX_PAGES = 500;
const MAX_BYTES = 64 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 120_000;
/**
 * How far before `since` to ask Cursor for. Usage lands on cursor.com with some
 * delay, and `burnlog sync` advances lastSync even when this adapter failed, so
 * a generous window lets the next sync recover a missed one. Overlap costs a
 * page or two; the server dedupes.
 */
const SINCE_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

const NOT_SIGNED_IN = "Cursor is installed but not signed in";
const REFUSED = "cursor.com refused the session — open Cursor and sign in again";

type CursorTokenUsage = {
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadTokens?: unknown;
  cacheWriteTokens?: unknown;
};

type CursorUsageEvent = {
  timestamp?: unknown;
  model?: unknown;
  kind?: unknown;
  conversationId?: unknown;
  tokenUsage?: CursorTokenUsage | null;
};

type Page = { totalUsageEventsCount?: unknown; usageEventsDisplay?: unknown };

/** Candidate `state.vscdb` paths, exactly as tokscale lists them per platform. */
export function stateDbCandidates(): string[] {
  const explicit = process.env.BURNLOG_CURSOR_STATE_DB;
  if (explicit) return [explicit];
  const home = homedir();
  if (process.platform === "darwin") {
    return [join(home, "Library/Application Support/Cursor/User/globalStorage/state.vscdb")];
  }
  if (process.platform === "win32") {
    const out: string[] = [];
    if (process.env.APPDATA) out.push(join(process.env.APPDATA, "Cursor", "User/globalStorage/state.vscdb"));
    out.push(join(home, "AppData/Roaming/Cursor/User/globalStorage/state.vscdb"));
    return out;
  }
  return [join(home, ".config/Cursor/User/globalStorage/state.vscdb")];
}

function findStateDb(): string | undefined {
  return stateDbCandidates().find((p) => existsSync(p));
}

async function readAccessToken(db: string): Promise<string | undefined> {
  const rows = await querySqlite(db, "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'");
  const v = rows[0]?.value;
  const s = typeof v === "string" ? v : v instanceof Uint8Array ? Buffer.from(v).toString("utf8") : "";
  return s.trim() || undefined;
}

/** `sub` is e.g. `auth0|user_abc`; the cookie wants the `user_…` part. */
export function userIdFromJwt(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const sub = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.sub;
    if (typeof sub !== "string") return undefined;
    const m = /user_[A-Za-z0-9_]+/.exec(sub);
    return m && m[0].length > "user_".length ? m[0] : undefined;
  } catch {
    return undefined;
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Cursor sends Unix ms as a string; tolerate a number or ISO string too. */
function parseTimestamp(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const t = v.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const d = Date.parse(t);
  return Number.isNaN(d) ? 0 : d;
}

/** Map one `usageEventsDisplay` row. Token buckets mirror tokscale exactly. */
export function toBurnEvent(raw: CursorUsageEvent): BurnEvent | null {
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!model) return null;
  const ts = parseTimestamp(raw.timestamp);
  if (!ts) return null;
  const u = raw.tokenUsage ?? {};
  const inputTokens = num(u.inputTokens);
  const outputTokens = num(u.outputTokens);
  const cacheReadTokens = num(u.cacheReadTokens);
  const cacheCreationTokens = num(u.cacheWriteTokens);
  // Errored/aborted requests come back with no tokens; they carry nothing.
  if (!inputTokens && !outputTokens && !cacheReadTokens && !cacheCreationTokens) return null;

  // Events carry no id of their own. Hash only fields that never change once
  // Cursor records the event, so a re-fetch produces the same id.
  const conv = typeof raw.conversationId === "string" ? raw.conversationId : "";
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  const requestId =
    "cursor-" +
    createHash("sha256")
      .update([ts, model, kind, conv, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens].join("\u0000"))
      .digest("hex")
      .slice(0, 32);

  return {
    requestId,
    source: "cursor",
    model,
    provider: providerFromModel(model),
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    timestamp: new Date(ts).toISOString(),
  };
}

function headers(cookie: string): Record<string, string> {
  return {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: `WorkosCursorSessionToken=${cookie}`,
    Referer: "https://www.cursor.com/settings",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
    Origin: "https://cursor.com",
  };
}

/**
 * Walk every page. Returns what was collected plus, if the walk stopped early,
 * why — partial history is still worth uploading since the server dedupes.
 */
async function fetchEvents(
  cookie: string,
  window?: { start: number; end: number },
): Promise<{ events: CursorUsageEvent[]; pages: number; error?: string }> {
  const events: CursorUsageEvent[] = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let total: number | undefined;
  let bytes = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { events, pages: page - 1, error: "cursor.com was too slow; history is partial" };

    const body: Record<string, unknown> = { teamId: 0, page, pageSize: PAGE_SIZE };
    if (window) {
      body.startDate = String(window.start);
      body.endDate = String(window.end);
    }

    let res: Response;
    try {
      res = await globalThis.fetch(ENDPOINT, {
        method: "POST",
        headers: headers(cookie),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(PAGE_TIMEOUT_MS, remaining)),
      });
    } catch (err) {
      const e = err as Error;
      const why = e.name === "TimeoutError" || e.name === "AbortError" ? "timed out" : e.message;
      return { events, pages: page - 1, error: `couldn't reach cursor.com (${why})` };
    }

    if (res.status === 401 || res.status === 403) {
      return { events, pages: page - 1, error: REFUSED };
    }
    if (!res.ok) return { events, pages: page - 1, error: `cursor.com returned HTTP ${res.status}` };

    const text = await res.text();
    bytes += text.length;
    if (bytes > MAX_BYTES) return { events, pages: page, error: "Cursor usage history exceeded 64 MiB; stopped" };

    let data: Page;
    try {
      data = JSON.parse(text) as Page;
    } catch {
      // Vercel's bot check answers 200 with an HTML challenge page.
      return { events, pages: page, error: "cursor.com answered with a bot-check page instead of usage data" };
    }
    if (!data || !Array.isArray(data.usageEventsDisplay)) {
      return { events, pages: page, error: "cursor.com response had no usageEventsDisplay (API changed?)" };
    }
    if (total === undefined) {
      const t = Number(data.totalUsageEventsCount);
      if (Number.isFinite(t)) total = t;
    }
    const got = data.usageEventsDisplay as CursorUsageEvent[];
    events.push(...got);

    // Page until the advertised total, so a server that clamps pageSize
    // doesn't end the walk early; fall back to a short page when no total.
    if (total !== undefined) {
      if (events.length >= total) return { events, pages: page };
      if (got.length === 0) return { events, pages: page, error: "cursor.com stopped before its advertised total" };
    } else if (got.length < PAGE_SIZE) {
      return { events, pages: page };
    }
  }
  return { events, pages: MAX_PAGES, error: `stopped at the ${MAX_PAGES}-page limit` };
}

export class CursorAdapter implements Adapter {
  readonly name = "cursor";

  detect(): boolean {
    return findStateDb() !== undefined;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const empty = (note: string, scannedFiles = 0): ScanResult => ({
      source: this.name,
      events: [],
      scannedFiles,
      totalLines: 0,
      note,
    });

    const db = findStateDb();
    if (!db) return empty("not installed");

    let token: string | undefined;
    try {
      token = await readAccessToken(db);
    } catch (err) {
      return empty(`couldn't read Cursor's login database (${(err as Error).message})`, 1);
    }
    if (!token) return empty(NOT_SIGNED_IN, 1);

    const userId = userIdFromJwt(token);
    if (!userId) return empty("Cursor's saved login is unreadable — open Cursor and sign in again", 1);

    const now = Date.now();
    const window = opts.since ? { start: opts.since.getTime() - SINCE_MARGIN_MS, end: now } : undefined;
    const { events: raw, pages, error } = await fetchEvents(`${userId}%3A%3A${token}`, window);

    const events: BurnEvent[] = [];
    for (const r of raw) {
      const e = toBurnEvent(r ?? {});
      // Enforce the window locally too, in case the server ignores it.
      if (e && (!window || Date.parse(e.timestamp) >= window.start)) events.push(e);
    }

    const result: ScanResult = { source: this.name, events, scannedFiles: 1, totalLines: raw.length };
    if (error) result.note = events.length ? `${error} (kept ${events.length} events from ${pages} pages)` : error;
    return result;
  }
}

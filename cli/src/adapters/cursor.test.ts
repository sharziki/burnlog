import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CursorAdapter, toBurnEvent } from "./cursor.js";

const USER = "user_01ABCXYZ";

function jwt(sub: string): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "none" })}.${b({ sub })}.sig`;
}

function stateDb(token?: string): string {
  const db = join(mkdtempSync(join(tmpdir(), "bl-cursor-")), "state.vscdb");
  const insert = token === undefined ? "" : `insert into ItemTable values ('cursorAuth/accessToken', '${token}');`;
  execFileSync("sqlite3", [
    db,
    `create table ItemTable (key text unique on conflict replace, value blob);
     insert into ItemTable values ('cursorAuth/stripeMembershipType', 'pro');${insert}`,
  ]);
  return db;
}

function event(ts: number, model: string, usage: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { timestamp: String(ts), model, kind: "USAGE_EVENT_KIND_INCLUDED_IN_PRO", conversationId: "conv-1", tokenUsage: usage, ...extra };
}

type Call = { url: string; body: any; headers: Record<string, string> };
let calls: Call[];
const realFetch = globalThis.fetch;

function stubFetch(respond: (body: any) => { status?: number; json?: unknown; text?: string }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const r = respond(body);
    const text = r.text ?? JSON.stringify(r.json);
    return new Response(text, { status: r.status ?? 200 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.BURNLOG_CURSOR_STATE_DB;
});

test("token mapping follows tokscale's buckets", () => {
  const e = toBurnEvent(
    event(1788171994838, "claude-4.5-sonnet", {
      inputTokens: 22252,
      outputTokens: "4283",
      cacheReadTokens: 1379927,
      cacheWriteTokens: 512,
      totalCents: 74.03,
    }),
  )!;
  assert.equal(e.source, "cursor");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 22252);
  assert.equal(e.outputTokens, 4283);
  assert.equal(e.cacheReadTokens, 1379927);
  assert.equal(e.cacheCreationTokens, 512);
  assert.equal(e.timestamp, new Date(1788171994838).toISOString());
  // Opaque, stable, and not derived visibly from the conversation id.
  assert.match(e.requestId, /^cursor-[0-9a-f]{32}$/);
  assert.equal(e.requestId, toBurnEvent(event(1788171994838, "claude-4.5-sonnet", { inputTokens: 22252, outputTokens: "4283", cacheReadTokens: 1379927, cacheWriteTokens: 512, totalCents: 1 }))!.requestId);
  assert.ok(!e.requestId.includes("conv-1"));

  // Missing cacheWriteTokens -> 0; uncharged events still count.
  const free = toBurnEvent(event(1788171000000, "gpt-5", { inputTokens: 10, outputTokens: 5 }, { chargedCents: 0 }))!;
  assert.equal(free.cacheCreationTokens, 0);
  assert.equal(free.provider, "openai");

  assert.equal(toBurnEvent(event(1788171000000, "", { inputTokens: 1 })), null);
  assert.equal(toBurnEvent(event(0, "gpt-5", { inputTokens: 1 })), null);
  assert.equal(toBurnEvent(event(1788171000000, "gpt-5", {})), null);
});

test("walks pages to the advertised total and sends the session cookie", async () => {
  const token = jwt(`auth0|${USER}`);
  process.env.BURNLOG_CURSOR_STATE_DB = stateDb(token);
  const t = Date.parse("2026-09-01T00:00:00Z");
  const pages: Record<number, unknown[]> = {
    1: [event(t, "gpt-5", { inputTokens: 1 }), event(t + 1, "gpt-5", { inputTokens: 2 })],
    2: [event(t + 2, "claude-4-opus", { outputTokens: 3 })],
  };
  // Server clamps pageSize to 2: a short page must not end the walk early.
  stubFetch((b) => ({ json: { totalUsageEventsCount: 3, usageEventsDisplay: pages[b.page] ?? [] } }));

  const r = await new CursorAdapter().scan();
  assert.equal(r.note, undefined);
  assert.equal(r.events.length, 3);
  assert.deepEqual(calls.map((c) => c.body.page), [1, 2]);
  assert.equal(calls[0].url, "https://cursor.com/api/dashboard/get-filtered-usage-events");
  assert.equal(calls[0].body.pageSize, 500);
  assert.equal(calls[0].body.teamId, 0);
  assert.equal(calls[0].body.startDate, undefined, "full history when no since");
  assert.equal(calls[0].headers.Cookie, `WorkosCursorSessionToken=${USER}%3A%3A${token}`);
  assert.equal(calls[0].headers.Origin, "https://cursor.com");
  // The token must not leak into anything the adapter returns.
  assert.ok(!JSON.stringify(r).includes(token));
});

test("since requests only the recent window and drops older events", async () => {
  process.env.BURNLOG_CURSOR_STATE_DB = stateDb(jwt(USER));
  const since = new Date("2026-09-20T00:00:00Z");
  const old = since.getTime() - 30 * 86_400_000;
  stubFetch(() => ({
    json: {
      totalUsageEventsCount: 2,
      usageEventsDisplay: [event(old, "gpt-5", { inputTokens: 1 }), event(since.getTime() + 5, "gpt-5", { inputTokens: 2 })],
    },
  }));

  const r = await new CursorAdapter().scan({ since });
  const start = Number(calls[0].body.startDate);
  assert.ok(start < since.getTime(), "window starts before since (margin)");
  assert.ok(start >= since.getTime() - 8 * 86_400_000, "margin is bounded");
  assert.ok(Number(calls[0].body.endDate) >= since.getTime());
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].inputTokens, 2);
});

test("not signed in: no token, no network", async () => {
  process.env.BURNLOG_CURSOR_STATE_DB = stateDb();
  stubFetch(() => ({ json: {} }));
  const r = await new CursorAdapter().scan();
  assert.equal(r.note, "Cursor is installed but not signed in");
  assert.equal(calls.length, 0);
});

test("auth failure becomes a note, not a throw", async () => {
  process.env.BURNLOG_CURSOR_STATE_DB = stateDb(jwt(USER));
  stubFetch(() => ({ status: 401, text: "unauthorized" }));
  const r = await new CursorAdapter().scan();
  assert.equal(r.events.length, 0);
  assert.equal(r.note, "cursor.com refused the session — open Cursor and sign in again");
});

test("network error and bot-check page become notes", async () => {
  process.env.BURNLOG_CURSOR_STATE_DB = stateDb(jwt(USER));
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.match((await new CursorAdapter().scan()).note!, /couldn't reach cursor.com/);

  stubFetch(() => ({ text: "<html>Vercel Security Checkpoint</html>" }));
  assert.match((await new CursorAdapter().scan()).note!, /bot-check/);
});

test("not installed", async () => {
  process.env.BURNLOG_CURSOR_STATE_DB = "/nonexistent/state.vscdb";
  const a = new CursorAdapter();
  assert.equal(a.detect(), false);
  assert.equal((await a.scan()).note, "not installed");
});

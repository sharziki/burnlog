import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GeminiAdapter } from "./gemini.js";
import type { BurnEvent } from "./types.js";

function home(): string {
  return mkdtempSync(join(tmpdir(), "bl-gemini-"));
}

function put(h: string, rel: string, body: string): void {
  const full = join(h, "tmp", rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
}

function scan(h: string): BurnEvent[] {
  process.env.BURNLOG_GEMINI_DIR = h;
  try {
    return new GeminiAdapter().scan().events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } finally {
    delete process.env.BURNLOG_GEMINI_DIR;
  }
}

const buckets = (e: BurnEvent) => [e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens];

function chat(messages: object[]): string {
  return JSON.stringify({
    sessionId: "ses_123",
    projectHash: "abc123",
    startTime: "2025-06-15T12:00:00Z",
    lastUpdated: "2025-06-15T12:30:00Z",
    messages,
  });
}

test("gemini: not installed / no tmp", () => {
  process.env.BURNLOG_GEMINI_DIR = join(tmpdir(), "bl-gemini-missing");
  const r = new GeminiAdapter().scan();
  delete process.env.BURNLOG_GEMINI_DIR;
  assert.equal(r.note, "not installed");
});

test("gemini chat recording: user turns skipped, thoughts go to output", () => {
  const h = home();
  put(
    h,
    "abc/chats/session-1.json",
    chat([
      { id: "msg_1", timestamp: "2025-06-15T12:00:00Z", type: "user", content: [{ text: "hi" }] },
      { id: "msg_2", timestamp: "2025-06-15T12:01:00Z", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 10, output: 20 } },
    ]),
  );
  const ev = scan(h);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].model, "gemini-2.0-flash");
  assert.equal(ev[0].provider, "google");
  assert.deepEqual(buckets(ev[0]), [10, 20, 0, 0]);
  assert.equal(ev[0].timestamp, "2025-06-15T12:01:00.000Z");
});

test("gemini chat recording: cached removed from input only when total proves inclusion", () => {
  const h = home();
  put(
    h,
    "abc/chats/session-a.json",
    chat([
      // total 37 == 15+20+2 (inclusive) → input 10, cached 5.
      { id: "a", timestamp: "2025-06-15T12:01:00Z", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 15, output: 20, cached: 5, thoughts: 2, total: 37 } },
      // total 37 == 10+20+2+5 (already net) → input stays 10.
      { id: "b", timestamp: "2025-06-15T12:02:00Z", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 10, output: 20, cached: 5, thoughts: 2, total: 37 } },
      // camelCase aliases: 100 prompt incl. 20 cached.
      { id: "c", timestamp: "2025-06-15T12:03:00Z", type: "gemini", model: "gemini-3-flash-preview", tokens: { promptTokenCount: 100, candidatesTokenCount: 50, cachedContentTokenCount: 20, totalTokenCount: 150 } },
      // non-"gemini" type with tokens still counts.
      { id: "d", timestamp: "2025-06-15T12:04:00Z", type: "assistant", model: "gemini-3-flash-preview", tokens: { input: 150, output: 40, cached: 10, total: 190 } },
    ]),
  );
  assert.deepEqual(scan(h).map(buckets), [
    [10, 22, 5, 0],
    [10, 22, 5, 0],
    [80, 50, 20, 0],
    [140, 40, 10, 0],
  ]);
});

test("gemini: non-session .json only read at tmp/<hash>/chats/<file>", () => {
  const h = home();
  const body = chat([{ id: "m", timestamp: "2025-06-15T12:01:00Z", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 10, output: 20 } }]);
  put(h, "abc123/chats/uuid-file.json", body);
  put(h, "abc123/backup/chats/uuid-file.json", body.replace("ses_123", "ses_other"));
  put(h, "abc123/logs.json", "[]");
  const ev = scan(h);
  assert.equal(ev.length, 1);
});

test("gemini streamed jsonl: direct tokens, tool counted as input, repeated ids replace", () => {
  const h = home();
  put(
    h,
    "123/chats/session-abc.jsonl",
    [
      `{"sessionId":"gemini-session-1","projectHash":"123"}`,
      `{"id":"msg-1","timestamp":"2026-05-01T00:01:00.000Z","type":"gemini","model":"gemini-3.1-pro-preview","tokens":{"input":14918,"output":60,"cached":0,"thoughts":863,"tool":7,"total":15848}}`,
      `{"type":"gemini","id":"msg-2","timestamp":"2026-05-01T00:02:00.000Z","model":"gemini-3.1-pro-preview","tokens":{"input":10,"output":1,"cached":0,"thoughts":0,"tool":0,"total":11}}`,
      `not json`,
      `{"type":"gemini","id":"msg-2","timestamp":"2026-05-01T00:02:00.000Z","model":"gemini-3.1-pro-preview","tokens":{"input":20,"output":2,"cached":5,"thoughts":3,"tool":0,"total":25}}`,
      `{"type":"result","stats":{"input_tokens":99`,
    ].join("\n"),
  );
  assert.deepEqual(scan(h).map(buckets), [
    [14925, 923, 0, 0],
    [15, 5, 5, 0],
  ]);
});

test("gemini headless: stats per model (prompt includes cached), flat stats, net-input alias", () => {
  const h = home();
  put(h, "x/chats/headless.json", `{"response":"Hi","stats":{"models":{"gemini-2.5-pro":{"tokens":{"prompt":12,"candidates":34,"cached":5,"thoughts":2}}}},"timestamp":"2026-01-01T00:00:00Z"}`);
  put(
    h,
    "run1.jsonl",
    [
      `{"type":"init","model":"gemini-2.5-pro","session_id":"session-1","timestamp":"2026-01-02T00:00:00Z"}`,
      `{"type":"result","timestamp":"2026-01-02T00:00:01Z","stats":{"input_tokens":12,"output_tokens":20,"cached_tokens":5,"thoughts_tokens":3}}`,
    ].join("\n"),
  );
  put(
    h,
    "run2.jsonl",
    [
      `{"type":"init","model":"gemini-2.5-pro","session_id":"session-2"}`,
      `{"type":"result","timestamp":"2026-01-03T00:00:00Z","stats":{"total_tokens":32,"output_tokens":20,"cached":5,"input":7}}`,
    ].join("\n"),
  );
  put(h, "x/chats/clamp.json", `{"timestamp":"2026-01-04T00:00:00Z","stats":{"models":{"gemini-2.5-pro":{"tokens":{"prompt":5,"candidates":2,"cached":10}}}}}`);
  const ev = scan(h);
  assert.deepEqual(ev.map(buckets), [
    [7, 36, 5, 0],
    [7, 23, 5, 0],
    [7, 20, 5, 0],
    [0, 2, 10, 0],
  ]);
  assert.ok(ev.every((e) => e.model === "gemini-2.5-pro"));
});

test("gemini: requestIds are opaque and stable across scans", () => {
  const h = home();
  put(h, "abc/chats/session-1.json", chat([{ id: "m", timestamp: "2025-06-15T12:01:00Z", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 1, output: 1 } }]));
  const a = scan(h);
  const b = scan(h);
  assert.equal(a[0].requestId, b[0].requestId);
  assert.match(a[0].requestId, /^[0-9a-f]{32}$/);
  assert.ok(!a[0].requestId.includes("ses_123"));
});

test("gemini: since skips old files", () => {
  const h = home();
  put(h, "abc/chats/session-1.json", chat([{ id: "m", type: "gemini", model: "gemini-2.0-flash", tokens: { input: 1, output: 1 } }]));
  process.env.BURNLOG_GEMINI_DIR = h;
  const r = new GeminiAdapter().scan({ since: new Date(Date.now() + 3600_000) });
  delete process.env.BURNLOG_GEMINI_DIR;
  assert.equal(r.events.length, 0);
});

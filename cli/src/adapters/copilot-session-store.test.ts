import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CopilotSessionStoreAdapter } from "./copilot-session-store.js";

const SCHEMA = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT, repository TEXT, host_type TEXT, branch TEXT,
  summary TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, turn_index INTEGER,
  model TEXT, copilot_usage_model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  cache_write_tokens INTEGER, reasoning_tokens INTEGER, total_nano_aiu INTEGER, duration_ms INTEGER, created_at TEXT);`;

function fixture(sql: string): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-cpss-"));
  execFileSync("sqlite3", [join(dir, "session-store.db"), SCHEMA + sql]);
  return dir;
}

function ev(session: string, model: string | null, usageModel: string | null, i: number, o: number, cr: number, cw: number, r: number, nano: number, at: string): string {
  const q = (s: string | null) => (s === null ? "NULL" : `'${s}'`);
  return `INSERT INTO assistant_usage_events (session_id, turn_index, model, copilot_usage_model, input_tokens,
    output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, total_nano_aiu, created_at)
    VALUES ('${session}', 0, ${q(model)}, ${q(usageModel)}, ${i}, ${o}, ${cr}, ${cw}, ${r}, ${nano}, '${at}');`;
}

async function scan(dir: string) {
  process.env.BURNLOG_COPILOT_DIR = dir;
  try {
    return await new CopilotSessionStoreAdapter().scan();
  } finally {
    delete process.env.BURNLOG_COPILOT_DIR;
  }
}

test("missing database: not installed", async () => {
  const res = await scan(mkdtempSync(join(tmpdir(), "bl-cpss-")));
  assert.equal(res.events.length, 0);
  assert.equal(res.note, "not installed");
});

test("missing table: no events", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-cpss-"));
  execFileSync("sqlite3", [join(dir, "session-store.db"), "create table other(a int);"]);
  assert.equal((await scan(dir)).events.length, 0);
});

test("skips zero-token rows", async () => {
  const res = await scan(fixture(ev("s1", "gpt-5.4-mini", null, 0, 0, 0, 0, 0, 0, "2026-07-01 12:34:56")));
  assert.equal(res.events.length, 0);
});

test("subtracts cache read and write from input; timestamp is UTC", async () => {
  const res = await scan(fixture(ev("s1", "gpt-5.4-mini", null, 21_343, 100, 0, 20_974, 7, 556_570_000, "2026-07-01 12:34:56")));
  assert.equal(res.events.length, 1);
  const e = res.events[0];
  assert.equal(e.inputTokens, 369);
  assert.equal(e.cacheReadTokens, 0);
  assert.equal(e.cacheCreationTokens, 20_974);
  assert.equal(e.outputTokens, 107); // output + reasoning
  assert.equal(Date.parse(e.timestamp), 1_782_909_296_000);
  assert.match(e.requestId, /^[0-9a-f]{32}$/);
  assert.equal(e.provider, "openai");
});

test("prefers copilot_usage_model", async () => {
  const res = await scan(fixture(ev("s1", "gpt-4o", "claude-sonnet-4-5", 10, 5, 0, 0, 0, 1, "2026-07-01 12:34:56")));
  assert.equal(res.events[0].model, "claude-sonnet-4-5");
  assert.equal(res.events[0].provider, "anthropic");
});

test("falls back to session created_at", async () => {
  const res = await scan(
    fixture(
      `INSERT INTO sessions (id, cwd, created_at) VALUES ('s1', '/Users/dev/secret', '2026-07-01T12:34:56.000Z');` +
        ev("s1", "gpt-5.4-mini", null, 10, 5, 0, 0, 0, 1, "not-a-timestamp"),
    ),
  );
  assert.equal(res.events.length, 1);
  assert.equal(Date.parse(res.events[0].timestamp), 1_782_909_296_000);
  assert.ok(!JSON.stringify(res.events).includes("secret"));
});

test("since skips an unchanged database", async () => {
  const dir = fixture(ev("s1", "gpt-4o", null, 10, 5, 0, 0, 0, 0, "2026-07-01 12:34:56"));
  process.env.BURNLOG_COPILOT_DIR = dir;
  try {
    const res = await new CopilotSessionStoreAdapter().scan({ since: new Date(Date.now() + 3_600_000) });
    assert.equal(res.events.length, 0);
  } finally {
    delete process.env.BURNLOG_COPILOT_DIR;
  }
});

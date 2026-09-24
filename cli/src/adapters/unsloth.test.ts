import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { UnslothAdapter } from "./unsloth.js";

const SCHEMA = `
CREATE TABLE chat_threads (id TEXT PRIMARY KEY, model_id TEXT);
CREATE TABLE chat_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, metadata_json TEXT, created_at INTEGER NOT NULL);`;
const API = `CREATE TABLE api_usage_events (id TEXT PRIMARY KEY, subject TEXT NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL, total_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL);`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function scanWith(sql: string) {
  const home = mkdtempSync(join(tmpdir(), "bl-unsloth-"));
  execFileSync("sqlite3", [join(home, "studio.db"), sql]);
  const prev = process.env.BURNLOG_UNSLOTH_DIR;
  process.env.BURNLOG_UNSLOTH_DIR = home;
  try {
    return await new UnslothAdapter().scan();
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_UNSLOTH_DIR;
    else process.env.BURNLOG_UNSLOTH_DIR = prev;
  }
}

test("internal chat usage and content-free API usage", async () => {
  const meta = `{"privatePreview":"never select this","contextUsage":{"promptTokens":100,"completionTokens":40,"totalTokens":140,"cachedTokens":30,"cacheWriteTokens":10,"reasoningTokens":5,"modelId":"requested-model"},"responseDetails":{"responseModelId":"claude-sonnet-4-6","providerType":"anthropic"}}`;
  const r = await scanWith(`${SCHEMA}${API}
    INSERT INTO chat_threads VALUES ('thread-1','thread-fallback');
    INSERT INTO chat_messages VALUES ('message-1','thread-1','assistant',${q(meta)},1788000000123);
    INSERT INTO api_usage_events VALUES ('request-1','private-user','/v1/chat/completions','unsloth/local-api-model','completed',20,7,27,1788000100);`);
  assert.equal(r.events.length, 2);
  const chat = r.events.find((e) => e.requestId === "unsloth:chat:message-1")!;
  assert.equal(chat.model, "claude-sonnet-4-6");
  assert.equal(chat.provider, "anthropic");
  assert.equal(chat.timestamp, new Date(1788000000123).toISOString());
  assert.equal(chat.inputTokens, 60);
  assert.equal(chat.outputTokens, 40); // reasoning (5) stays inside output
  assert.equal(chat.cacheReadTokens, 30);
  assert.equal(chat.cacheCreationTokens, 10);
  const api = r.events.find((e) => e.requestId === "unsloth:api:request-1")!;
  assert.equal(api.model, "unsloth/local-api-model");
  assert.equal(api.timestamp, new Date(1788000100000).toISOString());
  assert.equal(api.inputTokens, 20);
  assert.equal(api.outputTokens, 7);
  assert.equal(api.provider, "other");
  // Privacy: nothing from metadata beyond scalars, and no endpoint/subject.
  assert.ok(!JSON.stringify(r.events).includes("never select"));
  assert.ok(!JSON.stringify(r.events).includes("/v1/chat"));
});

test("older schema without the API table still parses chat usage", async () => {
  const r = await scanWith(`${SCHEMA}
    INSERT INTO chat_threads VALUES ('thread-1','fallback-model');
    INSERT INTO chat_messages VALUES ('message-1','thread-1','assistant','{"contextUsage":{"promptTokens":5,"completionTokens":3,"totalTokens":8}}',1788000000);`);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "fallback-model");
  assert.equal(r.events[0].inputTokens + r.events[0].outputTokens, 8);
});

test("local routes are provider other; custom routes use the model heuristic", async () => {
  const r = await scanWith(`${SCHEMA}
    INSERT INTO chat_threads VALUES ('thread-1','fallback-model');
    INSERT INTO chat_messages VALUES ('local-message','thread-1','assistant','{"contextUsage":{"promptTokens":10,"completionTokens":2,"totalTokens":12},"responseDetails":{"responseModelId":"local-model","providerType":"local"}}',1788000000);
    INSERT INTO chat_messages VALUES ('custom-message','thread-1','assistant','{"contextUsage":{"promptTokens":20,"completionTokens":4,"totalTokens":24},"responseDetails":{"responseModelId":"gpt-5.4","providerType":"custom"}}',1788000000);`);
  assert.equal(r.events.length, 2);
  const custom = r.events.find((e) => e.requestId === "unsloth:chat:custom-message")!;
  assert.equal(custom.model, "gpt-5.4");
  assert.equal(custom.provider, "openai");
  const local = r.events.find((e) => e.requestId === "unsloth:chat:local-message")!;
  assert.equal(local.model, "local-model");
  assert.equal(local.provider, "other");
});

test("skips user messages, malformed metadata and zero usage", async () => {
  const r = await scanWith(`${SCHEMA}
    INSERT INTO chat_messages VALUES ('user-1','thread-1','user','{"contextUsage":{"promptTokens":10,"totalTokens":10}}',1788000000);
    INSERT INTO chat_messages VALUES ('assistant-bad','thread-1','assistant','not-json',1788000000);
    INSERT INTO chat_messages VALUES ('assistant-zero','thread-1','assistant','{"contextUsage":{"promptTokens":0,"completionTokens":0,"totalTokens":0}}',1788000000);`);
  assert.equal(r.events.length, 0);
});

test("missing database is not installed", async () => {
  const prev = process.env.BURNLOG_UNSLOTH_DIR;
  process.env.BURNLOG_UNSLOTH_DIR = join(tmpdir(), "bl-unsloth-missing-xyz");
  try {
    const a = new UnslothAdapter();
    assert.equal(a.detect(), false);
    assert.equal((await a.scan()).note, "not installed");
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_UNSLOTH_DIR;
    else process.env.BURNLOG_UNSLOTH_DIR = prev;
  }
});

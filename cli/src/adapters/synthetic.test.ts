import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { normalizeSyntheticModel, SyntheticAdapter } from "./synthetic.js";

async function scanWith(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), "bl-synth-"));
  execFileSync("sqlite3", [join(dir, "sqlite.db"), sql]);
  const prev = process.env.BURNLOG_SYNTHETIC_DIR;
  process.env.BURNLOG_SYNTHETIC_DIR = dir;
  try {
    return await new SyntheticAdapter().scan();
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_SYNTHETIC_DIR;
    else process.env.BURNLOG_SYNTHETIC_DIR = prev;
  }
}

test("normalizes synthetic.new model ids", () => {
  assert.equal(normalizeSyntheticModel("hf:deepseek-ai/DeepSeek-V3-0324"), "deepseek-v3-0324");
  assert.equal(normalizeSyntheticModel("hf:zai-org/GLM-4.7"), "glm-4.7");
  assert.equal(normalizeSyntheticModel("hf:moonshotai/Kimi-K2.5"), "kimi-k2.5");
  assert.equal(normalizeSyntheticModel("accounts/fireworks/models/deepseek-v3-0324"), "deepseek-v3-0324");
  assert.equal(normalizeSyntheticModel("claude-sonnet-4-5"), "claude-sonnet-4-5");
  assert.equal(normalizeSyntheticModel("gpt-4o"), "gpt-4o");
});

test("current Octofriend (input history only) yields nothing, with a note", async () => {
  const r = await scanWith("CREATE TABLE input_history (id INTEGER PRIMARY KEY, input TEXT); INSERT INTO input_history VALUES (1,'secret prompt');");
  assert.equal(r.events.length, 0);
  assert.match(r.note ?? "", /no token usage/);
});

test("messages table: buckets, reasoning folded into output, normalized model", async () => {
  const r = await scanWith(`CREATE TABLE messages (id TEXT, model TEXT, input_tokens INT, output_tokens INT, cache_read_tokens INT, cache_write_tokens INT, reasoning_tokens INT, cost REAL, timestamp REAL, session_id TEXT, provider TEXT, content TEXT);
    INSERT INTO messages VALUES ('m1','hf:deepseek-ai/DeepSeek-V3-0324',100,20,30,5,7,0.1,1700000000,'s','synthetic','secret');
    INSERT INTO messages VALUES ('m2','x',0,0,0,0,0,0,1700000000,'s','synthetic','secret');`);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.requestId, "synthetic:m1");
  assert.equal(e.model, "deepseek-v3-0324");
  assert.equal(e.inputTokens, 100);
  assert.equal(e.outputTokens, 27);
  assert.equal(e.cacheReadTokens, 30);
  assert.equal(e.cacheCreationTokens, 5);
  assert.equal(e.timestamp, new Date(1700000000000).toISOString());
});

test("token_usage table fallback", async () => {
  const r = await scanWith(`CREATE TABLE token_usage (id TEXT, model TEXT, input_tokens INT, output_tokens INT, timestamp REAL, session_id TEXT);
    INSERT INTO token_usage VALUES ('t1','accounts/fireworks/models/glm-4.7',10,4,1700000000000,'s');`);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "glm-4.7");
  assert.equal(r.events[0].inputTokens, 10);
  assert.equal(r.events[0].outputTokens, 4);
});

test("missing database is not installed", async () => {
  const prev = process.env.BURNLOG_SYNTHETIC_DIR;
  process.env.BURNLOG_SYNTHETIC_DIR = join(tmpdir(), "bl-synth-missing-xyz");
  try {
    assert.equal((await new SyntheticAdapter().scan()).note, "not installed");
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_SYNTHETIC_DIR;
    else process.env.BURNLOG_SYNTHETIC_DIR = prev;
  }
});

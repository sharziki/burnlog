import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AntigravityAdapter } from "./antigravity.js";

function scanWith(lines: string): ReturnType<AntigravityAdapter["scan"]> {
  const root = mkdtempSync(join(tmpdir(), "bl-ag-"));
  mkdirSync(join(root, "sessions"));
  writeFileSync(join(root, "sessions", "abc.jsonl"), lines);
  process.env.BURNLOG_ANTIGRAVITY_DIR = root;
  try {
    return new AntigravityAdapter().scan();
  } finally {
    delete process.env.BURNLOG_ANTIGRAVITY_DIR;
  }
}

test("antigravity: usage row falls back to session_meta model and aliases it", () => {
  const r = scanWith(
    `{"type":"session_meta","sessionId":"abc","modelId":"claude-sonnet-4.6"}\n` +
      `{"type":"usage","sessionId":"abc","timestamp":1711200000000,"input":12,"output":4,"cacheRead":2,"cacheWrite":0,"reasoning":1,"responseId":"resp-1"}\n`,
  ) as Awaited<ReturnType<AntigravityAdapter["scan"]>>;
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "claude-sonnet-4-6");
  assert.equal(e.provider, "anthropic");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [12, 5, 2, 0]);
  assert.equal(e.requestId, "resp-1");
  assert.equal(e.timestamp, new Date(1711200000000).toISOString());
});

test("antigravity: placeholder model ids resolve; rows without responseId get an opaque id", () => {
  const r = scanWith(
    `{"type":"usage","sessionId":"abc","modelId":"MODEL_PLACEHOLDER_M26","timestamp":1711200000000,"input":12,"output":4}\n` +
      `{"type":"usage","sessionId":"abc","modelId":"model_placeholder_m16","timestamp":1711200000001,"input":8,"output":3}\n` +
      `{"type":"usage","sessionId":"abc","modelId":"x","timestamp":0,"input":8}\n` +
      `{"type":"usage","sessionId":"abc","modelId":"x","timestamp":1711200000002}\n`,
  ) as Awaited<ReturnType<AntigravityAdapter["scan"]>>;
  assert.deepEqual(r.events.map((e) => e.model), ["claude-opus-4-6", "gemini-3.1-pro"]);
  assert.match(r.events[0].requestId, /^[0-9a-f]{32}$/);
});

test("antigravity: no cache dir explains the tokscale sync requirement", () => {
  process.env.BURNLOG_ANTIGRAVITY_DIR = join(tmpdir(), "bl-ag-missing-xyz");
  try {
    const r = new AntigravityAdapter().scan();
    assert.match(r.note ?? "", /tokscale antigravity sync/);
  } finally {
    delete process.env.BURNLOG_ANTIGRAVITY_DIR;
  }
});

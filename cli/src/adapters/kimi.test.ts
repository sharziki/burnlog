import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const buckets = (e: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }) => [
  e.inputTokens,
  e.outputTokens,
  e.cacheReadTokens,
  e.cacheCreationTokens,
];

import { KimiAdapter } from "./kimi.js";

test("kimi legacy: StatusUpdate usage, model from config.json, progressive dedupe (tokscale fixtures)", () => {
  const root = tree({
    "config.json": `{"model": "kimi-k2-turbo"}`,
    "sessions/group/uuid1/wire.jsonl": [
      `{"type": "metadata", "protocol_version": "1.3"}`,
      `{"timestamp": 1770983400.0, "message": {"type": "TurnBegin", "payload": {"user_input": "hello"}}}`,
      `{"timestamp": 1770983410.0, "message": {"type": "StatusUpdate", "payload": {"token_usage": {"input_other": 100, "output": 10, "input_cache_read": 0, "input_cache_creation": 0}, "message_id": "msg-progressive"}}}`,
      `{"timestamp": 1770983420.0, "message": {"type": "StatusUpdate", "payload": {"token_usage": {"input_other": 120, "output": 30, "input_cache_read": 5, "input_cache_creation": 0}, "message_id": "msg-progressive"}}}`,
      `{"timestamp": 1771123711.615454, "message": {"type": "StatusUpdate", "payload": {"token_usage": {"input_other": 1508, "output": 205, "input_cache_read": 4864, "input_cache_creation": 7}, "message_id": "chatcmpl-2"}}}`,
    ].join("\n"),
  });
  process.env.BURNLOG_KIMI_DIR = join(root, "sessions");
  const r = new KimiAdapter().scan();
  assert.equal(r.events.length, 2);
  const byIn = Object.fromEntries(r.events.map((e) => [e.inputTokens, e]));
  assert.deepEqual(buckets(byIn[120]), [120, 30, 5, 0]);
  assert.equal(byIn[120].timestamp, new Date(1770983420000).toISOString());
  assert.deepEqual(buckets(byIn[1508]), [1508, 205, 4864, 7]);
  assert.equal(byIn[1508].model, "kimi-k2-turbo");
});

test("kimi code: turn-scoped usage.record only, model from llm.request, anchored at request start", () => {
  process.env.BURNLOG_KIMI_DIR = tree({
    "ws/sess1/agents/main/wire.jsonl": [
      `{"type":"llm.request","model":"kimi-code/kimi-k2.6","time":1770000000000}`,
      `{"type":"usage.record","model":"__kimi_env_model__","usageScope":"turn","time":1770000002000,"usage":{"inputOther":10,"output":4,"inputCacheRead":100,"inputCacheCreation":0}}`,
      `{"type":"step.end","usage":{"inputOther":10,"output":4}}`,
      `{"type":"usage.record","usageScope":"session","time":1770000003000,"usage":{"inputOther":999,"output":999}}`,
      `{"type":"usage.record","time":1770000004000,"usage":{"inputOther":999,"output":999}}`,
    ].join("\n"),
  });
  const r = new KimiAdapter().scan();
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "kimi-k2.6");
  assert.deepEqual(buckets(r.events[0]), [10, 4, 100, 0]);
  assert.equal(r.events[0].timestamp, new Date(1770000000000).toISOString());
});

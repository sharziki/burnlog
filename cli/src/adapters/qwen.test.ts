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

import { QwenAdapter } from "./qwen.js";

test("qwen: usageMetadata → buckets; thoughts fold into output (tokscale fixture)", () => {
  process.env.BURNLOG_QWEN_DIR = tree({
    "proj/chats/s.jsonl": [
      `{"type": "user", "timestamp": "2026-02-23T14:24:50.000Z", "content": "Hello"}`,
      `{"type": "assistant", "model": "qwen3-max-2026-01-23", "timestamp": "2026-02-23T14:24:56.857Z", "sessionId": "session1", "usageMetadata": {"promptTokenCount": 1508, "candidatesTokenCount": 205, "thoughtsTokenCount": 50, "cachedContentTokenCount": 4864}}`,
      `not json`,
      `{"type": "assistant", "model": "qwen3.5-plus", "timestamp": "2026-02-23T14:24:57.000Z", "sessionId": "session1", "usageMetadata": {"promptTokenCount": 0, "candidatesTokenCount": 0, "thoughtsTokenCount": 0, "cachedContentTokenCount": 0}}`,
    ].join("\n"),
  });
  const r = new QwenAdapter().scan();
  assert.equal(r.events.length, 1);
  assert.deepEqual(buckets(r.events[0]), [1508, 255, 4864, 0]);
  assert.equal(r.events[0].timestamp, "2026-02-23T14:24:56.857Z");
});

test("qwen: positional keys keep multi-turn messages apart; missing model is unknown", () => {
  const line = `{"type": "assistant", "timestamp": "2026-02-23T14:24:56.857Z", "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 200, "thoughtsTokenCount": 10, "cachedContentTokenCount": 5}}`;
  process.env.BURNLOG_QWEN_DIR = tree({ "a/chats/s.jsonl": `${line}\n${line}\n`, "b/chats/s.jsonl": `${line}\n` });
  const r = new QwenAdapter().scan();
  assert.equal(r.events.length, 3);
  assert.equal(r.events[0].model, "unknown");
});

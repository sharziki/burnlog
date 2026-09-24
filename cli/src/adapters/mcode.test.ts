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
import { McodeAdapter } from "./mcode.js";

test("mcode: legacy messages attributed by exec.result; envelope exec.completed; unattributed ignored", () => {
  process.env.BURNLOG_MCODE_DIR = tree({
    "run1.jsonl": [
      `{"type":"message","message":{"role":"assistant","turnId":"t1","timestamp":1770000000,"usage":{"inputTokens":100,"outputTokens":10,"cacheReadTokens":50,"cacheWriteTokens":5}}}`,
      `{"type":"message","message":{"role":"assistant","turnId":"t1","timestamp":1770000001000,"usage":{"inputTokens":20,"outputTokens":2}}}`,
      `{"type":"exec.result","turnId":"t1","sessionId":"s1","model":{"providerId":"minimax","modelId":"MiniMax-M2"}}`,
      `{"type":"message","message":{"role":"assistant","turnId":"t2","usage":{"inputTokens":999}}}`,
      `{"type":"exec.completed","turnId":"t3","sessionId":"s1","timestampMs":1770000009000,"result":{"model":{"providerId":"anthropic","modelId":"claude-sonnet-4"},"usage":{"inputTokens":7,"outputTokens":3}}}`,
    ].join("\n"),
  });
  const r = new McodeAdapter().scan();
  assert.equal(r.events.length, 3);
  const [a, b, c] = r.events;
  assert.deepEqual(buckets(a), [100, 10, 50, 5]);
  assert.equal(a.timestamp, new Date(1770000000000).toISOString());
  assert.equal(a.model, "MiniMax-M2");
  assert.deepEqual(buckets(b), [20, 2, 0, 0]);
  assert.equal(c.provider, "anthropic");
});

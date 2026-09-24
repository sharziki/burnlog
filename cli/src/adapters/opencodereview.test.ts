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
import { OpencodereviewAdapter } from "./opencodereview.js";

test("opencodereview: llm_response usage, start-anchored, duplicate lines collapse", () => {
  const resp = `{"type":"llm_response","model":"gpt-5","timestamp":"2026-03-01T10:00:05Z","duration_ms":5000,"usage":{"prompt_tokens":1200,"completion_tokens":300,"cache_read_tokens":800,"cache_write_tokens":0}}`;
  process.env.BURNLOG_OPENCODEREVIEW_DIR = tree({
    "repo/sess.jsonl": [
      `{"type":"session_start","cwd":"/secret/repo"}`,
      resp,
      resp,
      `{"type":"llm_response","model":"claude-sonnet-4","usage":{"prompt_tokens":10,"completion_tokens":1}}`,
      `{"type":"llm_response","model":"claude-sonnet-4","usage":{"prompt_tokens":10,"completion_tokens":1}}`,
      `{"type":"llm_response","model":"x","usage":{"prompt_tokens":0}}`,
    ].join("\n"),
  });
  const r = new OpencodereviewAdapter().scan();
  assert.equal(r.events.length, 3);
  const gpt = r.events.find((e) => e.model === "gpt-5")!;
  assert.deepEqual(buckets(gpt), [1200, 300, 800, 0]);
  assert.equal(gpt.timestamp, "2026-03-01T10:00:00.000Z");
});

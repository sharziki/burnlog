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
import { CodebuddyAdapter } from "./codebuddy.js";
import { parseBuddyExtensionLog } from "./tencent-buddy.js";

test("codebuddy jsonl: completed assistant/function_call lines, providerData usage, repeat keeps larger", () => {
  process.env.BURNLOG_CODEBUDDY_DIR = tree({
    "proj/s.jsonl": [
      `{"id":"m0","timestamp":1770000000000,"type":"message","role":"user","sessionId":"s"}`,
      `{"id":"m1","timestamp":1770000001000,"type":"message","role":"assistant","status":"completed","sessionId":"s","providerData":{"model":"deepseek-v3","messageId":"pm1","usage":{"prompt_tokens":1000,"completion_tokens":100,"prompt_cache_hit_tokens":800,"total_tokens":1100}}}`,
      `{"id":"m1b","timestamp":1770000002000,"type":"message","role":"assistant","status":"completed","sessionId":"s","providerData":{"model":"deepseek-v3","messageId":"pm1","usage":{"prompt_tokens":1000,"completion_tokens":150,"prompt_cache_hit_tokens":800,"total_tokens":1150}}}`,
      `{"id":"m2","timestamp":1770000003000,"type":"function_call","status":"in_progress","sessionId":"s","providerData":{"usage":{"input_tokens":5}}}`,
      `{"id":"m3","timestamp":1770000004000,"type":"function_call","sessionId":"s","message":{"usage":{"cachedMissTokens":7,"outputTokens":3,"cacheReadInputTokens":20,"reasoningTokens":2}}}`,
    ].join("\n"),
  });
  const r = new CodebuddyAdapter().scan();
  assert.equal(r.events.length, 2);
  const [a, b] = r.events;
  // total == input + output proves input includes the cache hit.
  assert.deepEqual(buckets(a), [200, 150, 800, 0]);
  assert.equal(a.model, "deepseek-v3");
  assert.deepEqual(buckets(b), [7, 5, 20, 0]);
  assert.equal(b.model, "codebuddy");
});

test("codebuddy extension log: model from CraftInvokableAgent, mirrored lines dedupe", () => {
  const root = tree({
    "CodeBuddyIDE/x.log": [
      `[2026-05-01 10:00:00.100] [info] [CraftInvokableAgent] [agent-1] Model prepared: Claude Sonnet (claude-sonnet-4)`,
      `[2026-05-01 10:00:05.100] [info] [AgentReporter] [agent-1] Agent execution successful with usage: {"inputTokens":50,"outputTokens":7,"cacheReadInputTokens":0}`,
      `[2026-05-01 10:00:05.140] [info] [AgentReporter] [agent-1] Agent execution successful with usage: {"inputTokens":50,"outputTokens":7,"cacheReadInputTokens":0}`,
    ].join("\n"),
  });
  const { events } = parseBuddyExtensionLog("codebuddy", "codebuddy", join(root, "CodeBuddyIDE", "x.log"));
  assert.equal(events.length, 2);
  assert.equal(events[0].requestId, events[1].requestId);
  assert.equal(events[0].model, "claude-sonnet-4");
  assert.equal(events[0].provider, "anthropic");
});

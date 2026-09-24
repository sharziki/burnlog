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
import { JunieAdapter } from "./junie.js";

test("junie: modelUsage rows, reasoning folded into output, start-anchored", () => {
  const ev = (ts: number, usage: object[]) =>
    JSON.stringify({ timestampMs: ts, event: { agentEvent: { kind: "LlmResponseMetadataEvent", agent: { name: "main" }, modelUsage: usage } } });
  process.env.BURNLOG_JUNIE_DIR = tree({
    "session-260501-101500-abcd/events.jsonl": [
      JSON.stringify({ kind: "UserPromptEvent", prompt: "secret" }),
      ev(1777630000000, [
        { model: "claude-sonnet-4-5", provider: "Anthropic", inputTokens: 100, outputTokens: 20, cacheInputTokens: 300, cacheCreateTokens: 40, reasoningTokens: 5, cost: 0.01, time: 2000 },
        { model: "gpt-5", input: "7", output: 3 },
      ]),
      // The same event logged twice counts once.
      ev(1777630000000, [{ model: "claude-sonnet-4-5", provider: "Anthropic", inputTokens: 100, outputTokens: 20, cacheInputTokens: 300, cacheCreateTokens: 40, reasoningTokens: 5, cost: 0.01, time: 2000 }]),
    ].join("\n"),
  });
  const r = new JunieAdapter().scan();
  assert.equal(r.events.length, 2);
  const claude = r.events.find((e) => e.model === "claude-sonnet-4-5")!;
  assert.deepEqual(buckets(claude), [100, 25, 300, 40]);
  assert.equal(claude.provider, "anthropic");
  assert.equal(claude.timestamp, new Date(1777630000000 - 2000).toISOString());
  const gpt = r.events.find((e) => e.model === "gpt-5")!;
  assert.deepEqual(buckets(gpt), [7, 3, 0, 0]);
});

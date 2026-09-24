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
import { ReasonixAdapter } from "./reasonix.js";

test("reasonix: stats records; cache_miss wins, else prompt − cache_hit; turn markers skipped", () => {
  process.env.BURNLOG_REASONIX_DIR = tree({
    "stats/2026-08-04.jsonl":
      "﻿" +
      [
        `{"ts":"2026-08-04T09:11:11Z","model":"deepseek/deepseek-chat","prompt":100,"completion":20,"reasoning":5,"cache_hit":60,"total":120,"requests":1}`,
        `{"ts":1785000000,"model":"anthropic/claude-sonnet-4","prompt":100,"completion":10,"cache_hit":10,"cache_miss":70,"total":110,"requests":1}`,
        `{"ts":"2026-08-04T09:12:00Z","model":"deepseek/deepseek-chat","turn":true,"total":5,"requests":1}`,
        `{"ts":"2026-08-04T09:13:00Z","model":"deepseek/deepseek-chat","prompt":0,"total":0,"requests":0}`,
        `garbage`,
      ].join("\r\n"),
    "sessions/x.jsonl": `{"ts":"2026-08-04T09:11:11Z","model":"a/b","prompt":1,"total":1,"requests":1}`,
  });
  const r = new ReasonixAdapter().scan();
  assert.equal(r.events.length, 2);
  const [a, b] = r.events;
  assert.deepEqual(buckets(a), [40, 20, 60, 0]);
  assert.equal(a.model, "deepseek-chat");
  assert.deepEqual(buckets(b), [70, 10, 10, 0]);
  assert.equal(b.provider, "anthropic");
  assert.equal(b.timestamp, new Date(1785000000000).toISOString());
});

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

import { execFileSync } from "child_process";
import { ZcodeAdapter } from "./zcode.js";

test("zcode jsonl: aliases; inclusive totals are split; reasoning folded back into output", async () => {
  process.env.BURNLOG_ZCODE_DIR = tree({
    "projects/p/s.jsonl": [
      `{"role":"user","content":"hi","sessionId":"z1"}`,
      `{"role":"assistant","model":"GLM-5.2","timestamp":"2026-06-01T00:00:00Z","usage":{"input_tokens":1000,"output_tokens":200,"cache_read_tokens":600,"reasoningTokens":50,"totalTokens":1200}}`,
      `{"role":"assistant","timestamp":"2026-06-01T00:00:01Z","token_usage":{"prompt_tokens":10,"completion_tokens":5}}`,
      `{"role":"assistant","content":"no usage -> not estimated"}`,
    ].join("\n"),
  });
  const r = await new ZcodeAdapter().scan();
  assert.equal(r.events.length, 2);
  const [a, b] = r.events;
  assert.equal(a.model, "glm-5.2");
  assert.deepEqual(buckets(a), [400, 200, 600, 0]);
  assert.deepEqual(buckets(b), [10, 5, 0, 0]);
});

test("zcode sqlite: model_usage rows (modern and legacy schemas)", async () => {
  const root = tree({});
  mkdirSync(join(root, "cli", "db"), { recursive: true });
  const db = join(root, "cli", "db", "db.sqlite");
  execFileSync("sqlite3", [
    db,
    `create table model_usage(id text, session_id text, turn_id text, model_id text, started_at int, completed_at int, duration_ms int,
       input_tokens int, output_tokens int, reasoning_tokens int, cache_read_input_tokens int, cache_creation_input_tokens int, agent text, mode text);
     insert into model_usage values ('r1','s','t','GLM-5.2',NULL,1770000005000,5000,1000,200,50,600,0,NULL,NULL);
     insert into model_usage values ('r2','s','t','GLM-5.2',1770000010000,NULL,NULL,0,0,0,0,0,NULL,NULL);`,
  ]);
  process.env.BURNLOG_ZCODE_DIR = root;
  const r = await new ZcodeAdapter().scan();
  assert.equal(r.events.length, 1);
  // Legacy schema: input includes cache, output includes reasoning.
  assert.deepEqual(buckets(r.events[0]), [400, 200, 600, 0]);
  assert.equal(r.events[0].timestamp, new Date(1770000000000).toISOString());
});

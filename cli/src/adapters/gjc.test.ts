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

import { GjcAdapter } from "./gjc.js";

test("gjc: assistant usage, unix-ms timestamp, replay dedupe (tokscale fixtures)", () => {
  const session = `{"type":"session","id":"gjc_ses_001","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/work/pi"}`;
  const msg = `{"type":"message","id":"msg_001","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","model":"claude-sonnet-4","provider":"anthropic","api":"anthropic","timestamp":1767225601000,"usage":{"input":100,"output":50,"cacheRead":10,"cacheWrite":5,"totalTokens":165,"cost":{"total":0.3}}}}`;
  process.env.BURNLOG_GJC_DIR = tree({
    "slug/a.jsonl": [session, `{"type":"service_tier_change","id":"x"}`, "not valid json", msg].join("\n"),
    // depth-2 per-pass replay of the same message
    "slug/a/1-pass.jsonl": [session, msg].join("\n"),
  });
  const r = new GjcAdapter().scan();
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.deepEqual(buckets(e), [100, 50, 10, 5]);
  assert.equal(e.provider, "anthropic");
  assert.equal(e.timestamp, new Date(1767225601000).toISOString());
});

test("gjc: header-less files fall back to their own file name", () => {
  const line = `{"type":"message","id":"msg_1","message":{"role":"assistant","model":"gpt-4o","provider":"openai","timestamp":1767225601000,"usage":{"input":1,"output":1}}}`;
  process.env.BURNLOG_GJC_DIR = tree({ "s/session_a.jsonl": line, "s/session_b.jsonl": line });
  assert.equal(new GjcAdapter().scan().events.length, 2);
});

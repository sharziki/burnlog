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

import { CommandcodeAdapter } from "./commandcode.js";

const line = (o: object) => JSON.stringify(o);

test("commandcode: v3 usage verbatim, org prefix dropped, provider from raw id", () => {
  process.env.BURNLOG_COMMANDCODE_DIR = tree({
    "slug/s1.jsonl": [
      line({ type: "session", version: 3, id: "s1" }),
      line({ type: "message", id: "u1", parentId: null, timestamp: "2026-05-01T00:00:00Z", message: { role: "user", content: "secret prompt" } }),
      line({
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-05-01T00:00:01Z",
        model: "anthropic/claude-sonnet-4",
        message: { role: "assistant", content: [] },
        usage: { inputTokens: 28534, outputTokens: 205, cacheReadTokens: 7424, cacheWriteTokens: 0, costUsd: 0.006 },
      }),
    ].join("\n"),
    "slug/s1.checkpoints.jsonl": line({ usage: { inputTokens: 999 } }),
  });
  const r = new CommandcodeAdapter().scan();
  assert.equal(r.events.length, 1);
  assert.deepEqual(buckets(r.events[0]), [28534, 205, 7424, 0]);
  assert.equal(r.events[0].model, "claude-sonnet-4");
  assert.equal(r.events[0].provider, "anthropic");
});

test("commandcode: /rewind-abandoned branch is dropped; /fork copies collapse", () => {
  const a = (id: string, parent: string | null, ts: string, input: number) =>
    line({ type: "message", id, parentId: parent, timestamp: ts, model: "gpt-5", message: { role: "assistant" }, usage: { inputTokens: input, outputTokens: 1 } });
  const s1 = [
    line({ type: "session", id: "s1" }),
    line({ type: "message", id: "u1", parentId: null, message: { role: "user" } }),
    a("a1", "u1", "2026-05-01T00:00:01Z", 10),
    a("orphan", "a1", "2026-05-01T00:00:02Z", 20), // abandoned by the rewind below
    a("a2", "a1", "2026-05-01T00:00:03Z", 30),
  ].join("\n");
  const fork = [line({ type: "session", id: "s2" }), line({ type: "message", id: "u1", parentId: null, message: { role: "user" } }), a("a1", "u1", "2026-05-01T00:00:01Z", 10)].join("\n");
  process.env.BURNLOG_COMMANDCODE_DIR = tree({ "slug/s1.jsonl": s1, "slug/s2.jsonl": fork });
  const inputs = new CommandcodeAdapter()
    .scan()
    .events.map((e) => e.inputTokens)
    .sort((x, y) => x - y);
  assert.deepEqual(inputs, [10, 30]);
});

test("commandcode: an all-zero reported usage is dropped, not estimated", () => {
  process.env.BURNLOG_COMMANDCODE_DIR = tree({
    "slug/s.jsonl": line({ type: "message", id: "a", model: "m", message: { role: "assistant", content: "x".repeat(400) }, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
  });
  assert.equal(new CommandcodeAdapter().scan().events.length, 0);
});

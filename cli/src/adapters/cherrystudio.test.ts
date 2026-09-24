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
import { CherrystudioAdapter } from "./cherrystudio.js";

const row = (uuid: string, requestId: string | null, messageId: string | null, ts: string, usage: object, model = "deepseek-chat") =>
  JSON.stringify({
    type: "assistant",
    uuid,
    ...(requestId ? { requestId } : {}),
    timestamp: ts,
    message: { ...(messageId ? { id: messageId } : {}), model, usage },
  });

test("cherrystudio: streaming re-appends of one call count once; distinct calls stay apart", () => {
  const u1 = { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 900 };
  const u1final = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 900 };
  process.env.BURNLOG_CHERRYSTUDIO_DIR = tree({
    "Data/Agents/.claude/projects/ws/s.jsonl": [
      row("a", "req_1", null, "2026-04-01T00:00:00Z", u1),
      row("b", "req_1", "msg_1", "2026-04-01T00:00:01Z", u1final),
      row("c", null, "msg_1", "2026-04-01T00:00:02Z", u1final),
      row("d", "req_2", "msg_2", "2026-04-01T00:01:00Z", { input_tokens: 10, output_tokens: 1 }),
      row("e", "req_3", null, "2026-04-01T00:02:00Z", { input_tokens: 10, output_tokens: 1 }, "<synthetic>"),
      JSON.stringify({ type: "user", message: { content: "secret" } }),
    ].join("\n"),
    // V1 copy of the same transcript is superseded by V2.
    ".claude/projects/ws/s.jsonl": row("z", "req_9", null, "2026-04-01T00:00:00Z", { input_tokens: 5, output_tokens: 5 }),
    // A V1-only transcript still counts.
    ".claude/projects/ws/old.jsonl": row("y", "req_8", null, "2026-03-01T00:00:00Z", { input_tokens: 1, output_tokens: 1 }),
  });
  const r = new CherrystudioAdapter().scan();
  const got = r.events.map((e) => buckets(e)).sort((x, y) => y[0] - x[0]);
  assert.deepEqual(got, [
    [100, 40, 900, 0],
    [10, 1, 0, 0],
    [1, 1, 0, 0],
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FreebuffAdapter } from "./freebuff.js";

const free = (agentType = "base2-free-deepseek-flash") => ({
  runState: { sessionState: { mainAgentState: { agentType } } },
});

function scanChat(body: unknown, model = "deepseek/deepseek-v4-flash") {
  const base = join(mkdtempSync(join(tmpdir(), "bl-fb-")), "manicode");
  const dir = join(base, "projects", "my-project", "chats", "2026-08-07T05-20-31.453Z");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "chat-messages.json"), JSON.stringify(body));
  writeFileSync(join(base, "settings.json"), JSON.stringify({ freebuffModel: model }));
  process.env.BURNLOG_FREEBUFF_DIR = join(base, "projects");
  try {
    return new FreebuffAdapter().scan();
  } finally {
    delete process.env.BURNLOG_FREEBUFF_DIR;
  }
}

test("freebuff: estimates tokens per turn at ceil(chars/4)", () => {
  const ts = "2026-08-07T05:20:31.453Z";
  const r = scanChat([
    { variant: "user", content: "hello world", timestamp: ts },
    { variant: "ai", content: "", blocks: [{ type: "text", content: "Hello!" }], timestamp: ts, metadata: free() },
    { variant: "user", content: "thanks", timestamp: ts },
    { variant: "ai", content: "", blocks: [{ type: "text", content: "You're welcome" }], timestamp: ts, metadata: free() },
  ]);
  const ev = r.events.sort((a, b) => a.outputTokens - b.outputTokens);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].model, "deepseek/deepseek-v4-flash");
  assert.deepEqual([ev[0].inputTokens, ev[0].outputTokens], [3, 2]);
  assert.deepEqual([ev[1].inputTokens, ev[1].outputTokens], [2, 4]);
  assert.equal(ev[0].cacheReadTokens + ev[0].cacheCreationTokens, 0);
  assert.match(r.note ?? "", /estimated/);
});

test("freebuff: chats with real usage are left to codebuff", () => {
  const r = scanChat([
    { variant: "user", content: "hi" },
    {
      variant: "ai",
      blocks: [{ type: "text", content: "Hello!" }],
      metadata: { model: "claude-sonnet-4", usage: { inputTokens: 500, outputTokens: 200 }, ...free("base2-free") },
    },
  ]);
  assert.equal(r.events.length, 0);
});

test("freebuff: unmarked (codebuff) chats and empty replies emit nothing", () => {
  assert.equal(
    scanChat([
      { variant: "user", content: "refactor this" },
      { variant: "ai", blocks: [{ type: "text", content: "Done." }], metadata: free("base2") },
    ]).events.length,
    0,
  );
  assert.equal(
    scanChat([
      { variant: "user", content: "hi" },
      { variant: "ai", content: "", blocks: [{ type: "text", content: "" }], metadata: free("base2-free") },
    ]).events.length,
    0,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { WorkbuddyAdapter, buddyBreakdown } from "./workbuddy.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "bl-wb-"));
}
function db(dir: string, sessions: Array<[string, string]>, usage: Array<[string, number, number]>) {
  const sql = [
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT, model TEXT);",
    "CREATE TABLE session_usage (session_id TEXT PRIMARY KEY, used INTEGER, size INTEGER, updated_at INTEGER, credit_json TEXT);",
    ...sessions.map(([id, model]) => `INSERT INTO sessions VALUES ('${id}', '/Users/alice/project', '${model}');`),
    ...usage.map(([id, used, at]) => `INSERT INTO session_usage VALUES ('${id}', ${used}, 1000000, ${at}, '{}');`),
  ].join("\n");
  execFileSync("sqlite3", [join(dir, "workbuddy.db"), sql]);
}
function jsonl(dir: string, name: string, lines: object[]) {
  const p = join(dir, "projects", "c-Users-alice-repo");
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, name), lines.map((l) => JSON.stringify(l)).join("\n"));
}
async function scan(dir: string) {
  process.env.BURNLOG_WORKBUDDY_DIR = dir;
  return new WorkbuddyAdapter().scan();
}

test("workbuddy: sqlite fallback reads session_usage as input", async () => {
  const dir = root();
  db(dir, [["session-1", "deepseek-v4-pro"]], [["session-1", 1234, 1_780_000_000_000], ["empty", 0, 1_780_000_000_000]]);
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "deepseek-v4-pro");
  assert.equal(e.inputTokens, 1234);
  assert.equal(e.outputTokens, 0);
  assert.equal(e.timestamp, new Date(1_780_000_000_000).toISOString());
});

test("workbuddy: function_call rawUsage splits cache out when the total proves inclusion", async () => {
  const dir = root();
  jsonl(dir, "session-1.jsonl", [
    { id: "call-1", timestamp: 1780000000100, type: "function_call", sessionId: "session-1", cwd: "/Users/alice/admin-panel",
      providerData: { requestModelId: "glm-5.2", messageId: "msg-1", rawUsage: { prompt_tokens: 140732, completion_tokens: 635, total_tokens: 141367, prompt_cache_hit_tokens: 76032 } } },
  ]);
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "glm-5.2");
  assert.equal(e.inputTokens, 64700);
  assert.equal(e.outputTokens, 635);
  assert.equal(e.cacheReadTokens, 76032);
});

test("workbuddy: detailed session suppresses its aggregate; other sessions keep fallback", async () => {
  const dir = root();
  jsonl(dir, "s.jsonl", [
    { id: "u", timestamp: 1780000000000, type: "message", role: "user", sessionId: "covered" },
    { id: "a1", timestamp: 1780000000100, type: "message", role: "assistant", status: "completed", sessionId: "covered",
      providerData: { model: "glm-5.2", messageId: "msg-1" },
      message: { usage: { input_tokens: 24486, output_tokens: 3, total_tokens: 24489, cache_read_input_tokens: 14720 } } },
    // Replayed copy of the same message with larger usage wins.
    { id: "a1b", timestamp: 1780000000200, type: "message", role: "assistant", status: "completed", sessionId: "covered",
      providerData: { model: "glm-5.2", messageId: "msg-1" },
      message: { usage: { input_tokens: 24486, output_tokens: 10, total_tokens: 24496, cache_read_input_tokens: 14720 } } },
    { id: "a2", timestamp: 1780000000300, type: "message", role: "assistant", status: "in_progress", sessionId: "covered",
      providerData: { model: "glm-5.2", messageId: "msg-2" }, message: { usage: { input_tokens: 5, output_tokens: 5 } } },
  ]);
  db(dir, [["covered", "glm-5.2"], ["only-db", "kimi-k2"]], [["covered", 99999, 1_780_000_000_000], ["only-db", 50, 1_780_000_000]]);
  const r = await scan(dir);
  assert.equal(r.events.length, 2);
  const detailed = r.events.find((e) => e.model === "glm-5.2")!;
  assert.equal(detailed.inputTokens, 9766);
  assert.equal(detailed.outputTokens, 10);
  assert.equal(detailed.cacheReadTokens, 14720);
  const fb = r.events.find((e) => e.model === "kimi-k2")!;
  assert.equal(fb.inputTokens, 50);
  assert.equal(fb.timestamp, new Date(1_780_000_000_000).toISOString());
});

test("workbuddy: usage breakdown edge cases from tokscale", () => {
  // Ambiguous: no total -> input unchanged; reasoning separate.
  assert.deepEqual(
    buddyBreakdown({ prompt_tokens: 3, completion_tokens: 2, prompt_cache_hit_tokens: 4, prompt_cache_write_tokens: 4, completion_thinking_tokens: 5 }),
    { input: 3, output: 2, reasoning: 5, cacheRead: 4, cacheWrite: 4 },
  );
  // Inclusive input with matching total.
  assert.equal(buddyBreakdown({ input_tokens: 113415, output_tokens: 990, total_tokens: 114405, cache_read_input_tokens: 112224 })!.input, 1191);
  // camelCase without total stays as written.
  assert.deepEqual(buddyBreakdown({ inputTokens: 7, outputTokens: 2, cacheTokens: 10 }), { input: 7, output: 2, reasoning: 0, cacheRead: 10, cacheWrite: 0 });
  // cachedMissTokens is authoritative, even when 0.
  assert.equal(buddyBreakdown({ inputTokens: 100, outputTokens: 5, cacheTokens: 100, cachedMissTokens: 0 })!.input, 0);
  assert.equal(buddyBreakdown({ inputTokens: 0, outputTokens: 0 }), null);
});

test("workbuddy: not installed", async () => {
  const r = await scan(join(tmpdir(), "bl-wb-none"));
  assert.equal(r.note, "not installed");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { KiloAdapter } from "./kilo.js";

function kiloDb(rows: Array<[string, string, string]>): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-kilo-"));
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const sql = [
    "CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data TEXT NOT NULL);",
    ...rows.map(([id, sid, data]) => `INSERT INTO message VALUES (${q(id)}, ${q(sid)}, ${q(data)});`),
  ].join("\n");
  execFileSync("sqlite3", [join(dir, "kilo.db"), sql]);
  return dir;
}

async function scan(dir: string, since?: Date) {
  process.env.BURNLOG_KILO_DIR = dir;
  return new KiloAdapter().scan(since ? { since } : {});
}

test("kilo: reads assistant rows, reasoning folds into output", async () => {
  const dir = kiloDb([
    [
      "row-msg-1",
      "sess-1",
      JSON.stringify({
        id: "embedded-msg-1",
        session_id: "sess-1",
        role: "assistant",
        modelID: "claude-sonnet-4",
        providerID: "anthropic",
        cost: 0.42,
        agent: "architect",
        tokens: { input: 1200, output: 300, reasoning: 40, cache: { read: 75, write: 25 } },
        time: { created: 1700000000123.0 },
      }),
    ],
  ]);
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.requestId, "embedded-msg-1");
  assert.equal(e.source, "kilo");
  assert.equal(e.model, "claude-sonnet-4");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 1200);
  assert.equal(e.outputTokens, 340);
  assert.equal(e.cacheReadTokens, 75);
  assert.equal(e.cacheCreationTokens, 25);
  assert.equal(e.timestamp, new Date(1700000000123).toISOString());
});

test("kilo: skips user, tokenless, modelless, invalid-json and partial-cache rows", async () => {
  const dir = kiloDb([
    ["row-user", "s", JSON.stringify({ role: "user", modelID: "gpt-5.4", tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } })],
    ["row-no-tokens", "s", JSON.stringify({ role: "assistant", modelID: "gpt-5.4" })],
    ["row-no-model", "s", JSON.stringify({ role: "assistant", tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } })],
    ["row-invalid-json", "s", "{not-json"],
    // Kilo requires both cache buckets (strict cache).
    ["row-no-cache", "s", JSON.stringify({ role: "assistant", modelID: "gpt-5.4", tokens: { input: 5, output: 5 } })],
    // Negative values clamp to zero -> nothing left to count.
    ["row-negative", "s", JSON.stringify({ role: "assistant", modelID: "gpt-5.4", tokens: { input: -100, output: -50, reasoning: -5, cache: { read: -20, write: -10 } } })],
    // No `time` object: kept, dated at the db's mtime; id falls back to row id.
    ["row-valid", "s", JSON.stringify({ role: "assistant", modelID: "gpt-5.4", tokens: { input: 10, output: 2, cache: { read: 0, write: 0 } } })],
  ]);
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.requestId, "row-valid");
  assert.equal(e.provider, "openai");
  assert.equal(e.inputTokens, 10);
  const mtime = statSync(join(dir, "kilo.db")).mtimeMs;
  assert.equal(e.timestamp, new Date(Math.trunc(mtime)).toISOString());
});

test("kilo: not installed / unchanged since", async () => {
  const missing = await scan(join(tmpdir(), "bl-kilo-does-not-exist"));
  assert.equal(missing.note, "not installed");
  const dir = kiloDb([]);
  const r = await scan(dir, new Date(Date.now() + 3600_000));
  assert.equal(r.events.length, 0);
  assert.match(r.note ?? "", /unchanged/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MicodeAdapter } from "./micode.js";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function makeDb(dir: string, name: string, rows: Array<[string, string, object | string]>) {
  const sql = [
    "CREATE TABLE session (id TEXT PRIMARY KEY, version TEXT, time_created INTEGER, directory TEXT);",
    "CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data TEXT NOT NULL);",
    ...rows.map(
      ([id, sid, data]) =>
        `INSERT INTO message VALUES (${q(id)}, ${q(sid)}, ${q(typeof data === "string" ? data : JSON.stringify(data))});`,
    ),
  ].join("\n");
  execFileSync("sqlite3", [join(dir, name), sql]);
}

const turn = (extra: object = {}) => ({
  role: "assistant",
  modelID: "mimo-v2-pro",
  providerID: "xiaomi",
  tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 0 } },
  time: { created: 1_780_000_000_000, completed: 1_780_000_001_000 },
  ...extra,
});

async function scan(dir: string) {
  process.env.BURNLOG_MICODE_DIR = dir;
  return new MicodeAdapter().scan();
}

test("micode: reads assistant usage; seconds epochs scale to ms; missing cache is 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-mimo-"));
  makeDb(dir, "mimocode.db", [
    ["m1", "s1", turn({ id: "msg-1" })],
    ["m2", "s1", { role: "assistant", modelID: "mimo-v2-flash", tokens: { input: 7, output: 3 }, time: { created: 1_780_000_000 } }],
    // No time object -> dropped for MiMo.
    ["m3", "s1", { role: "assistant", modelID: "mimo-v2-flash", tokens: { input: 7, output: 3 } }],
    ["m4", "s1", { role: "user", modelID: "x", tokens: { input: 1, output: 1 }, time: { created: 1 } }],
    ["m5", "s1", "{broken"],
  ]);
  const r = await scan(dir);
  assert.equal(r.events.length, 2);
  const a = r.events.find((e) => e.requestId === "msg-1")!;
  assert.equal(a.inputTokens, 100);
  assert.equal(a.outputTokens, 25);
  assert.equal(a.cacheReadTokens, 30);
  const b = r.events.find((e) => e.model === "mimo-v2-flash")!;
  assert.equal(b.timestamp, new Date(1_780_000_000_000).toISOString());
  assert.equal(b.cacheReadTokens, 0);
  assert.ok(!b.requestId.includes(dir), "row-id fallback must not carry the db path");
});

test("micode: same embedded id across channel dbs counts once; forked copies in one db collapse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-mimo-"));
  makeDb(dir, "mimocode.db", [
    ["a", "s1", turn({ id: "shared" })],
    // Fork copy: new session, new id, identical usage fingerprint.
    ["b", "s2", turn({ id: "fork-copy" })],
  ]);
  makeDb(dir, "mimocode-beta.db", [["x", "s9", turn({ id: "shared" })]]);
  // Not a MiMo db name: ignored.
  makeDb(dir, "other.db", [["y", "s9", turn({ id: "other" })]]);
  const r = await scan(dir);
  assert.equal(r.scannedFiles, 2);
  assert.deepEqual(r.events.map((e) => e.requestId).sort(), ["shared"]);
});

test("micode: identical usage in different dbs without shared id stays distinct", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-mimo-"));
  makeDb(dir, "mimocode.db", [["a", "s1", turn({ id: "one" })]]);
  makeDb(dir, "mimocode-dev.db", [["a", "s1", turn({ id: "two" })]]);
  const r = await scan(dir);
  assert.equal(r.events.length, 2);
});

test("micode: not installed", async () => {
  const r = await scan(join(tmpdir(), "bl-mimo-none"));
  assert.equal(r.note, "not installed");
});

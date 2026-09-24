import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DevinCliAdapter } from "./devin-cli.js";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function devinDb(sessions: Array<[string, string]>, messages: Array<[string, string, number]>): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-devin-"));
  const sql = [
    `CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, backend_type TEXT NOT NULL,
       model TEXT NOT NULL, title TEXT, agent_mode TEXT NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL);`,
    `CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, node_id INTEGER NOT NULL,
       parent_node_id INTEGER, chat_message TEXT NOT NULL, created_at INTEGER NOT NULL, metadata TEXT);`,
    ...sessions.map(([id, model]) => `INSERT INTO sessions VALUES (${q(id)}, '/Users/alice/project', 'windsurf', ${q(model)}, NULL, 'accept-edits', 1, 1);`),
    ...messages.map(([sid, chat, ts]) => `INSERT INTO message_nodes (session_id, node_id, chat_message, metadata, created_at) VALUES (${q(sid)}, 1, ${q(chat)}, NULL, ${ts});`),
  ].join("\n");
  execFileSync("sqlite3", [join(dir, "sessions.db"), sql]);
  return dir;
}

async function scan(dir: string) {
  process.env.BURNLOG_DEVIN_CLI_DIR = dir;
  return new DevinCliAdapter().scan();
}

test("devin-cli: reads metrics from chat_message; back-anchors timestamp by total_time_ms", async () => {
  const dir = devinDb(
    [["sess-1", "adaptive"]],
    [[
      "sess-1",
      `{"role":"assistant","content":"hello","metadata":{"num_tokens":147,"generation_model":"glm-5-2-max-1m","metrics":{"input_tokens":31134,"output_tokens":147,"cache_read_tokens":8,"cache_creation_tokens":null,"total_time_ms":2846}}}`,
      1_700_000_000,
    ]],
  );
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "glm-5-2-max-1m");
  assert.equal(e.inputTokens, 31134);
  assert.equal(e.outputTokens, 147);
  assert.equal(e.cacheReadTokens, 8);
  assert.equal(e.cacheCreationTokens, 0);
  assert.equal(e.timestamp, new Date(1_700_000_000_000 - 2846).toISOString());
  assert.ok(!e.requestId.includes("sess-1"));
});

test("devin-cli: duplicate rows of one request_id count once; row-id fallback keeps distinct rows", async () => {
  const dir = devinDb(
    [["sess-1", "gpt-5"]],
    [
      ["sess-1", `{"role":"assistant","metadata":{"request_id":"req-1","generation_model":"gpt-5","metrics":{"input_tokens":67,"output_tokens":103}}}`, 1_700_000_000],
      ["sess-1", `{"role":"assistant","metadata":{"request_id":"req-1","generation_model":"gpt-5","metrics":{"input_tokens":67,"output_tokens":103},"extensions":{"chisel/tool_call_content":{}}}}`, 1_700_000_000],
      ["sess-1", `{"role":"assistant","metadata":{"generation_model":"gpt-5","metrics":{"input_tokens":10,"output_tokens":5}}}`, 1_700_000_001],
      ["sess-1", `{"role":"assistant","metadata":{"generation_model":"gpt-5","metrics":{"input_tokens":20,"output_tokens":5}}}`, 1_700_000_002],
    ],
  );
  const r = await scan(dir);
  assert.equal(r.events.length, 3);
  assert.equal(r.events.reduce((s, e) => s + e.inputTokens, 0), 97);
});

test("devin-cli: skips user rows, adaptive fallback, zero usage and malformed json; session model fallback", async () => {
  const dir = devinDb(
    [["s-glm", "glm-5-2-max-1m"], ["s-adaptive", "adaptive"], ["s-kimi", "kimi-k2-7"]],
    [
      ["s-glm", `{"role":"user","content":"hi","metadata":{"metrics":{"input_tokens":1}}}`, 1_700_000_000],
      ["s-glm", "{not valid json", 1_700_000_000],
      ["s-glm", `{"role":"assistant","metadata":{"generation_model":"glm-5-2","metrics":{"input_tokens":-100,"output_tokens":-50,"cache_read_tokens":-10,"cache_creation_tokens":-5,"total_time_ms":-1}}}`, 1_700_000_000],
      ["s-adaptive", `{"role":"assistant","metadata":{"metrics":{"input_tokens":10,"output_tokens":5}}}`, 1_700_000_000],
      ["s-kimi", `{"role":"assistant","content":"ok","metadata":{"metrics":{"input_tokens":10,"output_tokens":5}}}`, 1_700_000_000],
      // metrics empty but num_tokens set -> all output
      ["s-glm", `{"role":"assistant","metadata":{"generation_model":"glm-5-2","num_tokens":42}}`, 1_700_000_003],
    ],
  );
  const r = await scan(dir);
  assert.equal(r.events.length, 2);
  const kimi = r.events.find((e) => e.model === "kimi-k2-7")!;
  assert.equal(kimi.inputTokens, 10);
  assert.equal(kimi.outputTokens, 5);
  const glm = r.events.find((e) => e.model === "glm-5-2")!;
  assert.equal(glm.outputTokens, 42);
  assert.equal(glm.inputTokens, 0);
});

test("devin-cli: not installed", async () => {
  const r = await scan(join(tmpdir(), "bl-devin-none"));
  assert.equal(r.note, "not installed");
});

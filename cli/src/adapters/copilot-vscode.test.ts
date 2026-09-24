import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { applyUpdate, CopilotVscodeAdapter, parseVscodeSessionFile } from "./copilot-vscode.js";

function sessionFile(name: string, lines: string[] | Buffer): string {
  const dir = join(mkdtempSync(join(tmpdir(), "bl-cpv-")), "chatSessions");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.jsonl`);
  writeFileSync(p, Array.isArray(lines) ? lines.join("\n") + "\n" : lines);
  return p;
}

test("kind 0 snapshot with requests", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const rs = parseVscodeSessionFile(
    sessionFile(uuid, [
      `{"kind":0,"v":{"requests":[{"requestId":"r1","message":{"text":"SECRET PROMPT"},"timestamp":1783918304896,"modelId":"copilot/auto","completionTokens":154,"promptTokens":22079,"result":{"metadata":{"promptTokens":22079,"outputTokens":154,"resolvedModel":"gpt-5.3-codex"}}}]}}`,
    ]),
  );
  assert.equal(rs.length, 1);
  assert.equal(rs[0].sessionId, uuid);
  assert.equal(rs[0].model, "gpt-5.3-codex");
  assert.equal(rs[0].timestampMs, 1783918304896);
  assert.deepEqual(rs[0].tokens, { input: 22079, output: 154, cacheRead: 0, cacheWrite: 0, reasoning: 0 });
  assert.equal(rs[0].key, `copilot-vscode:${uuid}:1783918304896`);
});

test("kind 2 append with reasoning from toolCallRounds, after an undecodable line", () => {
  const buf = Buffer.concat([
    Buffer.from(`{"kind":0,"v":{"requests":[]}}\n`),
    Buffer.from([0x7b, 0xff, 0xfe, 0x0a]),
    Buffer.from(
      `{"kind":2,"k":["requests"],"v":[{"requestId":"r2","timestamp":1783918310000,"modelId":"copilot/auto","completionTokens":200,"promptTokens":5000,"result":{"metadata":{"promptTokens":5000,"outputTokens":200,"resolvedModel":"gpt-5.3-codex","toolCallRounds":[{"thinking":{"tokens":88}},{"thinking":{"tokens":12}}]}}}]}\n`,
    ),
  ]);
  const rs = parseVscodeSessionFile(sessionFile("s", buf));
  assert.equal(rs.length, 1);
  assert.deepEqual([rs[0].tokens.input, rs[0].tokens.output, rs[0].tokens.reasoning], [5000, 200, 100]);
});

test("zero-token and non-copilot requests are skipped; copilot/ prefix stripped", () => {
  assert.equal(
    parseVscodeSessionFile(sessionFile("z", [`{"kind":2,"k":["requests"],"v":[{"timestamp":1000,"modelId":"copilot/auto","completionTokens":0,"promptTokens":0}]}`])).length,
    0,
  );
  assert.equal(
    parseVscodeSessionFile(sessionFile("n", [`{"kind":2,"k":["requests"],"v":[{"timestamp":4000,"modelId":"some-other-extension/model","completionTokens":50,"promptTokens":300}]}`])).length,
    0,
  );
  const rs = parseVscodeSessionFile(sessionFile("m", [`{"kind":2,"k":["requests"],"v":[{"timestamp":2000,"modelId":"copilot/gpt-4o","completionTokens":50,"promptTokens":300}]}`]));
  assert.equal(rs[0].model, "gpt-4o");
});

test("kind 1 path updates fill requests by position; nested appends don't shift indexes", () => {
  const rs = parseVscodeSessionFile(
    sessionFile("u", [
      `{"kind":0,"v":{"requests":[{"requestId":"r0","timestamp":1783918330000,"agent":{"id":"github.copilot"}}]}}`,
      `{"kind":1,"k":["requests",0,"promptTokens"],"v":12000}`,
      `{"kind":1,"k":["requests",0,"completionTokens"],"v":120}`,
      `{"kind":1,"k":["requests",0,"result"],"v":{"metadata":{"promptTokens":12000,"outputTokens":120,"resolvedModel":"gpt-5.3-codex"}}}`,
      `{"kind":2,"k":["requests",0,"response"],"v":[{"kind":"markdownContent","value":"part1"},{"kind":"toolInvocationSerialized"}]}`,
      `{"kind":2,"k":["requests"],"v":[{"requestId":"r1","timestamp":1783918340000}]}`,
      `{"kind":1,"k":["requests",1,"promptTokens"],"v":15000}`,
      `{"kind":1,"k":["requests",1,"completionTokens"],"v":250}`,
      `{"kind":1,"k":["requests",1,"result"],"v":{"metadata":{"resolvedModel":"gpt-5.6-luna"}}}`,
      `{"kind":1,"k":["requests",7,"promptTokens"],"v":999}`,
    ]),
  );
  assert.equal(rs.length, 2);
  assert.deepEqual([rs[0].timestampMs, rs[0].model, rs[0].tokens.input, rs[0].tokens.output], [1783918330000, "gpt-5.3-codex", 12000, 120]);
  assert.deepEqual([rs[1].timestampMs, rs[1].model, rs[1].tokens.input, rs[1].tokens.output], [1783918340000, "gpt-5.6-luna", 15000, 250]);
});

test("applyUpdate semantics", () => {
  assert.equal(applyUpdate({ a: 1 }, [], "replaced"), "replaced");
  assert.deepEqual(applyUpdate({}, ["result", "metadata", "outputTokens"], 143), { result: { metadata: { outputTokens: 143 } } });
  assert.deepEqual(applyUpdate({ result: 7 }, ["result", "metadata"], "x"), { result: { metadata: "x" } });
  assert.deepEqual(applyUpdate({ response: ["a"] }, ["response", 3], "d"), { response: ["a", null, null, "d"] });
  assert.deepEqual(applyUpdate({ response: ["a", "b", "c"] }, ["response", 1], "B"), { response: ["a", "B", "c"] });
  assert.deepEqual(applyUpdate({}, ["response", 2, "kind"], "m"), { response: [null, null, { kind: "m" }] });
  assert.deepEqual(applyUpdate({ response: [] }, ["response", 4097], "boom"), { response: [] });
  assert.deepEqual(applyUpdate({ response: [] }, ["response", 4097, "kind"], "boom"), { response: [] });
  assert.deepEqual(applyUpdate({ a: 1 }, [null], "x"), { a: 1 });
});

test("adapter: discovers workspaceStorage, hashes ids, dedupes against Copilot CLI stores", async () => {
  const ws = mkdtempSync(join(tmpdir(), "bl-cpv-ws-"));
  const chat = join(ws, "abc123", "chatSessions");
  mkdirSync(chat, { recursive: true });
  writeFileSync(join(ws, "abc123", "workspace.json"), `{"folder":"file:///Users/alice/secret-project"}`);
  writeFileSync(
    join(chat, "sess-1.jsonl"),
    [
      `{"kind":0,"v":{"requests":[{"timestamp":1783918304896,"modelId":"copilot/gpt-4o","promptTokens":100,"completionTokens":10,"result":{"metadata":{"toolCallRounds":[{"thinking":{"tokens":5}}]}}}]}}`,
      `{"kind":2,"k":["requests"],"v":[{"timestamp":1782909296000,"modelId":"copilot/gpt-4o","promptTokens":7,"completionTokens":3}]}`,
    ].join("\n"),
  );

  // A Copilot CLI session-store row for the same (session, timestamp) wins.
  const cp = mkdtempSync(join(tmpdir(), "bl-cpv-cp-"));
  execFileSync("sqlite3", [
    join(cp, "session-store.db"),
    `CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY, session_id TEXT, model TEXT, copilot_usage_model TEXT,
       input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER,
       reasoning_tokens INTEGER, total_nano_aiu INTEGER, created_at TEXT);
     INSERT INTO assistant_usage_events VALUES (1,'sess-1','gpt-4o',NULL,7,3,0,0,0,0,'2026-07-01T12:34:56Z');`,
  ]);

  process.env.BURNLOG_COPILOT_VSCODE_DIR = ws;
  process.env.BURNLOG_COPILOT_DIR = cp;
  try {
    const a = new CopilotVscodeAdapter();
    assert.equal(a.detect(), true);
    const res = await a.scan();
    assert.equal(res.events.length, 1);
    const e = res.events[0];
    assert.match(e.requestId, /^[0-9a-f]{32}$/);
    assert.deepEqual([e.inputTokens, e.outputTokens, e.model, e.provider], [100, 15, "gpt-4o", "openai"]);
    assert.ok(!JSON.stringify(res).includes("secret"));

    const later = await a.scan({ since: new Date(Date.now() + 3_600_000) });
    assert.equal(later.events.length, 0);
  } finally {
    delete process.env.BURNLOG_COPILOT_VSCODE_DIR;
    delete process.env.BURNLOG_COPILOT_DIR;
  }
});

test("adapter: not installed", async () => {
  process.env.BURNLOG_COPILOT_VSCODE_DIR = join(tmpdir(), "bl-cpv-does-not-exist");
  try {
    const res = await new CopilotVscodeAdapter().scan();
    assert.equal(res.note, "not installed");
  } finally {
    delete process.env.BURNLOG_COPILOT_VSCODE_DIR;
  }
});

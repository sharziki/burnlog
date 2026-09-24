import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { KiroAdapter, estimateTokens, parseKiroConversation } from "./kiro.js";

function cliDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-kiro-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

async function scanCli(files: Record<string, string>) {
  process.env.BURNLOG_KIRO_DIR = cliDir(files);
  delete process.env.BURNLOG_KIRO_DB;
  try {
    return await new KiroAdapter().scan();
  } finally {
    delete process.env.BURNLOG_KIRO_DIR;
  }
}

const cliJson = (turnFields: string) => `{
  "session_id": "sess-cli", "cwd": "/tmp/project",
  "session_state": {
    "rts_model_state": { "model_info": { "model_id": "auto", "context_window_tokens": 200000 } },
    "conversation_metadata": { "user_turn_metadatas": [{ ${turnFields} }] }
  }
}`;

test("kiro cli: estimates tokens from jsonl content", async () => {
  const json = `{"session_id":"session-1","cwd":"/tmp/project","session_state":{"rts_model_state":{"model_info":{"model_id":"claude-sonnet-4-5"}},"conversation_metadata":{"user_turn_metadatas":[{"input_token_count":0,"output_token_count":0,"turn_duration":123,"end_timestamp":1770983427,"total_request_count":2,"message_ids":["prompt-1","assistant-1"]}]}}}`;
  const jsonl = `{"version":"v1","kind":"Prompt","data":{"message_id":"prompt-1","content":[{"kind":"text","data":"hello world"}],"meta":{"timestamp":1770983426.420942}}}
not valid json at all
{"version":"v1","kind":"AssistantMessage","data":{"message_id":"assistant-1","content":[{"kind":"text","data":"response text"}]}}`;
  const r = await scanCli({ "session-1.json": json, "session-1.jsonl": jsonl });
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.source, "kiro");
  assert.equal(e.model, "claude-sonnet-4-5");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 3);
  assert.equal(e.outputTokens, 4);
  assert.equal(e.timestamp, new Date(1770983426420).toISOString());
  assert.doesNotMatch(e.requestId, /session|project/);
});

test("kiro cli: zero-content turn is skipped", async () => {
  const json = `{"session_id":"session-2","session_state":{"rts_model_state":{"model_info":{"model_id":"model"}},"conversation_metadata":{"user_turn_metadatas":[{"input_token_count":0,"output_token_count":0,"message_ids":["missing"]}]}}}`;
  const r = await scanCli({ "session-2.json": json, "session-2.jsonl": "" });
  assert.equal(r.events.length, 0);
});

test("kiro cli: tool-result bytes are fresh input; cache_read from context %", async () => {
  const json = `{"session_id":"session-tr","session_state":{"rts_model_state":{"model_info":{"model_id":"auto","context_window_tokens":100000}},"conversation_metadata":{"user_turn_metadatas":[{"input_token_count":0,"output_token_count":0,"user_prompt_length":20,"context_usage_percentage":5.0,"total_request_count":1,"message_ids":["assistant-tr"]}]}}}`;
  const tool = "0123456789012345678901234567890123456789";
  const jsonl = [
    `{"version":"v1","kind":"Prompt","data":{"message_id":"prompt-tr","content":[{"kind":"text","data":"hello"}],"meta":{"timestamp":1770983426.0}}}`,
    `{"version":"v1","kind":"ToolResults","data":{"message_id":"tr","content":[{"kind":"toolResult","data":{"toolUseId":"t1","content":[{"kind":"text","data":"${tool}"}],"status":"success"}}]}}`,
    `{"version":"v1","kind":"AssistantMessage","data":{"message_id":"assistant-tr","content":[{"kind":"text","data":"response text"}]}}`,
  ].join("\n");
  const r = await scanCli({ "s.json": json, "s.jsonl": jsonl });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].inputTokens, estimateTokens(60));
  assert.equal(r.events[0].cacheReadTokens, 5000 - estimateTokens(60));
});

test("kiro cli: json tool-result payload counts its compact serialization", async () => {
  const json = `{"session_id":"s3","session_state":{"rts_model_state":{"model_info":{"model_id":"auto","context_window_tokens":100000}},"conversation_metadata":{"user_turn_metadatas":[{"input_token_count":0,"output_token_count":0,"user_prompt_length":0,"context_usage_percentage":5.0,"message_ids":["a3"]}]}}}`;
  const compact = JSON.stringify({ exit_status: "exit status: 0", stdout: "hi" });
  const jsonl = [
    `{"version":"v1","kind":"Prompt","data":{"message_id":"p3","content":[{"kind":"text","data":"hi"}],"meta":{"timestamp":1770983426.0}}}`,
    `{"version":"v1","kind":"ToolResults","data":{"message_id":"t3","content":[{"kind":"toolResult","data":{"toolUseId":"t1","content":[{"kind":"json","data":${compact}}],"status":"success"}}]}}`,
    `{"version":"v1","kind":"AssistantMessage","data":{"message_id":"a3","content":[{"kind":"text","data":"ok"}]}}`,
  ].join("\n");
  const r = await scanCli({ "s3.json": json, "s3.jsonl": jsonl });
  assert.equal(r.events[0].inputTokens, estimateTokens(2 + compact.length));
});

test("kiro cli: hybrid real-data fixture", async () => {
  const r = await scanCli({
    "sess-cli.json": cliJson(`"user_prompt_length": 2, "context_usage_percentage": 3.9788,
      "input_token_count": 0, "output_token_count": 0, "cache_read_input_token_count": 0,
      "cache_write_input_token_count": 0, "assistant_response_length": 398,
      "total_request_count": 1, "message_ids": ["m1"]`),
    "sess-cli.jsonl": "",
  });
  const e = r.events[0];
  assert.equal(e.inputTokens, 1);
  assert.equal(e.cacheReadTokens, 7956);
  assert.equal(e.outputTokens, 100);
  assert.equal(e.cacheCreationTokens, 0);
});

test("kiro cli: real counts win", async () => {
  const r = await scanCli({
    "sess-cli.json": cliJson(`"user_prompt_length": 2, "context_usage_percentage": 3.9788,
      "input_token_count": 321, "output_token_count": 654, "cache_read_input_token_count": 111,
      "cache_write_input_token_count": 22, "assistant_response_length": 398, "message_ids": ["m1"]`),
  });
  const e = r.events[0];
  assert.deepEqual(
    [e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens],
    [321, 654, 111, 22],
  );
});

const conv = (metas: string[], window = 1000) =>
  `{"model_info":{"model_id":"auto","context_window_tokens":${window}},"history":[${metas
    .map((m) => `{"request_metadata":${m}}`)
    .join(",")}]}`;

test("kiro sqlite: hybrid estimate with duration metadata", () => {
  const ev = parseKiroConversation(
    "conv-1",
    conv([`{"context_usage_percentage":10,"response_size":40,"request_start_timestamp_ms":1770983426000,"stream_end_timestamp_ms":1770983427500}`]),
    0,
  );
  assert.equal(ev.length, 1);
  assert.equal(ev[0].model, "auto");
  assert.equal(ev[0].timestamp, new Date(1770983426000).toISOString());
  assert.equal(ev[0].inputTokens, 0);
  assert.equal(ev[0].cacheReadTokens, 100);
  assert.equal(ev[0].outputTokens, 10);
});

test("kiro sqlite: real counts, nested token_usage, reasoning folded into output", () => {
  const flat = parseKiroConversation("c", conv([`{"context_usage_percentage":10,"response_size":40,"input_tokens":300,"output_tokens":512,"cache_read_input_tokens":1920,"reasoning_tokens":40,"request_start_timestamp_ms":1}`]), 0);
  assert.deepEqual([flat[0].inputTokens, flat[0].outputTokens, flat[0].cacheReadTokens], [300, 552, 1920]);
  const nested = parseKiroConversation("c", conv([`{"context_usage_percentage":10,"response_size":40,"token_usage":{"input_tokens":300,"output_tokens":512,"cache_read_input_tokens":1920,"cache_write_input_tokens":64,"reasoning_tokens":40},"request_start_timestamp_ms":1}`]), 0);
  assert.deepEqual(
    [nested[0].inputTokens, nested[0].outputTokens, nested[0].cacheReadTokens, nested[0].cacheCreationTokens],
    [300, 552, 1920, 64],
  );
});

test("kiro sqlite: negative counts never produce negative tokens", () => {
  const ev = parseKiroConversation("c", conv([`{"context_usage_percentage":10,"response_size":40,"input_tokens":-5,"output_tokens":-9,"cache_read_input_tokens":-100,"cache_write_input_tokens":-200,"reasoning_tokens":-300,"request_start_timestamp_ms":1}`]), 0);
  assert.deepEqual(
    [ev[0].inputTokens, ev[0].outputTokens, ev[0].cacheReadTokens, ev[0].cacheCreationTokens],
    [0, 10, 100, 0],
  );
});

test("kiro sqlite: ToolUseResults text is fresh input", () => {
  const tool = "file contents here that came back from a tool";
  const value = `{"model_info":{"model_id":"auto","context_window_tokens":1000},"history":[{"user":{"content":{"ToolUseResults":{"tool_use_results":[{"tool_use_id":"t1","content":[{"Text":"${tool}"}]}]}}},"request_metadata":{"context_usage_percentage":30,"response_size":80,"request_start_timestamp_ms":1}}]}`;
  const ev = parseKiroConversation("c", value, 0);
  assert.equal(ev[0].inputTokens, 12);
  assert.equal(ev[0].cacheReadTokens, 300 - 12);
  assert.equal(ev[0].outputTokens, 20);
});

test("kiro sqlite: zero-token turn skipped", () => {
  assert.equal(parseKiroConversation("c", conv([`{"response_size":0}`]), 0).length, 0);
});

test("kiro: scans the sqlite database end to end", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-kiro-db-"));
  const db = join(dir, "data.sqlite3");
  const value = conv([`{"context_usage_percentage":10,"response_size":40,"request_start_timestamp_ms":1770983426000}`]).replace(/'/g, "''");
  execFileSync("sqlite3", [db, `create table conversations_v2(key text, conversation_id text, value text); insert into conversations_v2 values ('/tmp/p','conv-1','${value}');`]);
  process.env.BURNLOG_KIRO_DIR = join(dir, "no-cli");
  process.env.BURNLOG_KIRO_DB = db;
  try {
    const r = await new KiroAdapter().scan();
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].outputTokens, 10);
    const later = await new KiroAdapter().scan({ since: new Date(Date.now() + 86_400_000) });
    assert.equal(later.events.length, 0);
  } finally {
    delete process.env.BURNLOG_KIRO_DIR;
    delete process.env.BURNLOG_KIRO_DB;
  }
});

test("kiro: not installed", async () => {
  process.env.BURNLOG_KIRO_DIR = join(tmpdir(), "bl-kiro-missing-xyz");
  try {
    const r = await new KiroAdapter().scan();
    assert.equal(r.note, "not installed");
  } finally {
    delete process.env.BURNLOG_KIRO_DIR;
  }
});

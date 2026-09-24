import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GrokAdapter } from "./grok.js";
import type { BurnEvent } from "./types.js";

function home(): string {
  return mkdtempSync(join(tmpdir(), "bl-grok-"));
}

function session(h: string, updates: string, extra: { summary?: string; signals?: string } = {}): void {
  const dir = join(h, "sessions", "%2Ftmp%2Fproject", "session-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "updates.jsonl"), updates);
  if (extra.summary) writeFileSync(join(dir, "summary.json"), extra.summary);
  if (extra.signals) writeFileSync(join(dir, "signals.json"), extra.signals);
}

function unified(h: string, body: string): void {
  mkdirSync(join(h, "logs"), { recursive: true });
  writeFileSync(join(h, "logs", "unified.jsonl"), body);
}

function scan(h: string): BurnEvent[] {
  process.env.BURNLOG_GROK_DIR = h;
  try {
    const r = new GrokAdapter().scan();
    return r.events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } finally {
    delete process.env.BURNLOG_GROK_DIR;
  }
}

const upd = (o: object) => JSON.stringify({ method: "session/update", params: o });

test("grok: missing home is 'not installed'", () => {
  process.env.BURNLOG_GROK_DIR = join(tmpdir(), "bl-grok-does-not-exist");
  const r = new GrokAdapter().scan();
  delete process.env.BURNLOG_GROK_DIR;
  assert.equal(r.note, "not installed");
  assert.equal(r.events.length, 0);
});

test("grok unified: splits cached prompt and keeps reasoning in output, dedupes rows", () => {
  const h = home();
  unified(
    h,
    [
      `{"ts":"2023-11-14T22:13:19Z","pid":17,"sid":"session-1","msg":"model changed","ctx":{"model":"grok-composer-2.5-fast"}}`,
      `{"ts":"2023-11-14T22:13:19Z","pid":17,"msg":"model catalog: notifying clients","ctx":{"current_model_id":"grok-4.5"}}`,
      `{"ts":"2023-11-14T22:13:20Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":100,"cached_prompt_tokens":60,"completion_tokens":25,"reasoning_tokens":5}}`,
      `{"ts":"2023-11-14T22:13:21Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":2,"prompt_tokens":80,"cached_prompt_tokens":0,"completion_tokens":12,"reasoning_tokens":0}}`,
      `{"ts":"2023-11-14T22:13:20Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":100,"cached_prompt_tokens":60,"completion_tokens":25,"reasoning_tokens":5}}`,
      `{"ts":"2023-11-14T22:13:22Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":3,"prompt_tokens":10,"cached_prompt_tokens":11,"completion_tokens":1,"reasoning_tokens":0}}`,
      `{"ts":"2023-11-14T22:13:23Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":4,"prompt_tokens":10,"cached_prompt_tokens":0,"completion_tokens":1,"reasoning_tokens":2}}`,
    ].join("\n"),
  );
  const ev = scan(h);
  assert.equal(ev.length, 4);
  assert.equal(ev[0].model, "grok-composer-2.5-fast");
  assert.deepEqual(
    ev.map((e) => [e.inputTokens, e.outputTokens, e.cacheReadTokens]),
    [
      [40, 25, 60],
      [80, 12, 0],
      [0, 1, 10],
      [10, 1, 0], // reasoning clamped to completion
    ],
  );
  assert.ok(ev.every((e) => /^[0-9a-f]{32}$/.test(e.requestId)));
});

test("grok unified: model attribution (pidless switch, restart, subagent scopes, conflicts)", () => {
  const h = home();
  unified(
    h,
    [
      `{"ts":"2023-11-14T22:13:17Z","sid":"session-stable","msg":"model changed","ctx":{"model":"grok-session"}}`,
      `{"ts":"2023-11-14T22:13:18Z","pid":17,"msg":"model catalog: notifying clients","ctx":{"current_model_id":"grok-old"}}`,
      `{"ts":"2023-11-14T22:13:19Z","pid":17,"sid":"session-old","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":10,"completion_tokens":1}}`,
      `{"ts":"2023-11-14T22:13:20Z","pid":17,"msg":"AuthManager::new","src":"shell","ctx":{}}`,
      `{"ts":"2023-11-14T22:13:21Z","pid":17,"sid":"session-stable","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":15,"completion_tokens":1}}`,
      `{"ts":"2023-11-14T22:13:22Z","pid":17,"sid":"session-new","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":20,"completion_tokens":2}}`,
      `{"ts":"2023-11-14T22:13:23Z","pid":17,"msg":"model catalog: notifying clients","ctx":{"current_model_id":"grok-new"}}`,
      `{"ts":"2023-11-14T22:13:24Z","pid":17,"sid":"session-new","msg":"shell.turn.inference_done","ctx":{"loop_index":2,"prompt_tokens":30,"completion_tokens":3}}`,
    ].join("\n"),
  );
  assert.deepEqual(
    scan(h).map((e) => e.model),
    ["grok-old", "grok-session", "grok-unknown", "grok-new"],
  );

  const h2 = home();
  unified(
    h2,
    [
      `{"ts":"2026-07-31T00:00:00Z","pid":17,"msg":"subagent read parent config (live)","ctx":{"session_model_id":" grok-4.6 ","parent_model":"grok-4.5","global_model_id":"grok-4.4"}}`,
      `{"ts":"2026-07-31T00:00:01Z","pid":17,"sid":"parent","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":10,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:02Z","pid":17,"msg":"subagent spawn credentials","ctx":{"subagent_id":"child-a","effective_model":" grok-4.7 ","effective_model_raw":"raw-a","parent_model":"grok-4.6"}}`,
      `{"ts":"2026-07-31T00:00:03Z","pid":17,"sid":"child-a","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":11,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:04Z","pid":17,"msg":"subagent spawn credentials","ctx":{"subagent_id":"child-b","effective_model":"grok-4.8","parent_model":"grok-4.6"}}`,
      `{"ts":"2026-07-31T00:00:05Z","pid":17,"sid":"child-b","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":12,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:06Z","sid":"child-a","msg":"model changed","ctx":{"model":"grok-global"}}`,
      `{"ts":"2026-07-31T00:00:07Z","pid":17,"sid":"child-a","msg":"shell.turn.inference_done","ctx":{"loop_index":2,"prompt_tokens":13,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:08Z","sid":"ordinary","msg":"model changed","ctx":{"model":" grok-ordinary "}}`,
      `{"ts":"2026-07-31T00:00:09Z","pid":17,"sid":"ordinary","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":14,"completion_tokens":2}}`,
    ].join("\n"),
  );
  assert.deepEqual(
    scan(h2).map((e) => e.model),
    ["grok-4.6", "grok-4.7", "grok-4.8", "grok-4.7", "grok-ordinary"],
  );

  const h3 = home();
  unified(
    h3,
    [
      `{"ts":"2026-07-31T00:00:00Z","pid":19,"sid":"child","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":10,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:01Z","pid":19,"msg":"subagent spawn credentials","ctx":{"subagent_id":"child","effective_model":"grok-4.8"}}`,
      `{"ts":"2026-07-31T00:00:02Z","pid":19,"msg":"subagent failed","ctx":{"subagent_id":"child","effective_model":"grok-4.9"}}`,
      `{"ts":"2026-07-31T00:00:03Z","pid":19,"sid":"child","msg":"shell.turn.inference_done","ctx":{"loop_index":2,"prompt_tokens":11,"completion_tokens":2}}`,
      `{"ts":"2026-07-31T00:00:04Z","pid":19,"msg":"subagent completed","ctx":{"subagent_id":"missing","effective_model":null}}`,
      `{"ts":"2026-07-31T00:00:05Z","pid":19,"sid":"missing","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":12,"completion_tokens":2}}`,
    ].join("\n"),
  );
  const ev3 = scan(h3);
  assert.equal(ev3.length, 3);
  assert.ok(ev3.every((e) => e.model === "grok-unknown"));
});

test("grok unified: rows without event ids stay distinct, exact repeats collapse", () => {
  const h = home();
  unified(
    h,
    [
      `{"pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":100,"completion_tokens":25,"request_id":"first"}}`,
      `{"pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":100,"completion_tokens":25,"request_id":"second"}}`,
      `{"pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":100,"completion_tokens":25,"request_id":"first"}}`,
    ].join("\n"),
  );
  assert.equal(scan(h).length, 2);
});

test("grok unified: session model falls back to summary.json", () => {
  const h = home();
  const dir = join(h, "sessions", "%2Ftmp%2Fproject", "session-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), `{"current_model_id":"grok-4.5","updated_at":"2023-11-14T22:13:20Z"}`);
  unified(
    h,
    `{"ts":"2023-11-14T22:13:20Z","pid":17,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"loop_index":1,"prompt_tokens":10,"cached_prompt_tokens":2,"completion_tokens":4,"reasoning_tokens":1}}`,
  );
  const ev = scan(h);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].model, "grok-4.5");
  assert.deepEqual([ev[0].inputTokens, ev[0].outputTokens, ev[0].cacheReadTokens], [8, 4, 2]);
});

test("grok legacy: authoritative usage beats counter deltas", () => {
  const h = home();
  session(
    h,
    [
      upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk", _meta: { modelId: "grok-4.5" } }, _meta: { agentTimestampMs: 1700000001000 } }),
      upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 1200, agentTimestampMs: 1700000002000 } }),
      upd({
        sessionId: "session-1",
        update: {
          sessionUpdate: "turn_completed",
          usage: { inputTokens: 1000, outputTokens: 100, reasoningTokens: 20, cachedReadTokens: 400, totalTokens: 1100 },
        },
        _meta: { eventId: "turn-1", agentTimestampMs: 1700000003000 },
      }),
    ].join("\n"),
  );
  const ev = scan(h);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].model, "grok-4.5");
  // input 1000 incl. 400 cached; output 100 incl. 20 reasoning.
  assert.deepEqual([ev[0].inputTokens, ev[0].outputTokens, ev[0].cacheReadTokens], [600, 100, 400]);
  assert.equal(ev[0].timestamp, new Date(1700000003000).toISOString());
});

test("grok legacy: cumulative totals become per-turn deltas; monotonic; BOM ok", () => {
  const h = home();
  session(
    h,
    "﻿" +
      [
        upd({ sessionId: "session-1", update: { sessionUpdate: "available_commands_update" }, _meta: { totalTokens: 100, agentTimestampMs: 1700000000000 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk", _meta: { modelId: "grok-composer-2.5-fast" } }, _meta: { agentTimestampMs: 1700000001000 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "agent_thought_chunk" }, _meta: { totalTokens: 250, agentTimestampMs: 1700000002000 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 300, agentTimestampMs: 1700000003000 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 120, agentTimestampMs: 1700000003500 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk", _meta: { modelId: "grok-composer-2.5-fast" } }, _meta: { agentTimestampMs: 1700000004000 } }),
        upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 450, agentTimestampMs: 1700000005000 } }),
      ].join("\n"),
    { summary: `{"current_model_id":"grok-composer-2.5-fast","updated_at":"2023-11-14T22:13:20Z"}` },
  );
  const ev = scan(h);
  assert.deepEqual(
    ev.map((e) => [e.inputTokens, e.outputTokens, e.timestamp]),
    [
      [200, 0, new Date(1700000003000).toISOString()],
      [150, 0, new Date(1700000005000).toISOString()],
    ],
  );
  assert.ok(ev.every((e) => e.model === "grok-composer-2.5-fast"));
});

test("grok legacy: signals.json reconciles compacted totals, anchored to last update", () => {
  const h = home();
  session(
    h,
    [
      upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk", _meta: { modelId: "grok-build" } }, _meta: { agentTimestampMs: 1700000000000 } }),
      upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 171056, agentTimestampMs: 1700000001000 } }),
    ].join("\n"),
    { signals: `{"primaryModelId":"grok-build","totalTokensBeforeCompaction":3224659,"contextTokensUsed":172309}` },
  );
  const ev = scan(h);
  assert.equal(ev.length, 2);
  assert.equal(ev.reduce((s, e) => s + e.inputTokens, 0), 3396968);
  assert.ok(ev.every((e) => e.timestamp === new Date(1700000001000).toISOString()));

  const h2 = home();
  session(
    h2,
    upd({ sessionId: "session-1", update: { sessionUpdate: "available_commands_update" }, _meta: { totalTokens: 50, agentTimestampMs: 1700000000000 } }),
    { signals: `{"primaryModelId":"grok-composer-2.5-fast","contextTokensUsed":250}` },
  );
  const ev2 = scan(h2);
  assert.deepEqual(ev2.map((e) => e.inputTokens).sort((a, b) => a - b), [50, 200]);
  assert.ok(ev2.some((e) => e.model === "grok-composer-2.5-fast" && e.inputTokens === 200));
});

test("grok: unified log supersedes covered legacy rows, keeps uncovered history", () => {
  const h = home();
  session(
    h,
    [
      upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk", _meta: { modelId: "grok-4.5" } }, _meta: { agentTimestampMs: 1700000000000 } }),
      upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 10, agentTimestampMs: 1700000000500 } }),
      upd({ sessionId: "session-1", update: { sessionUpdate: "user_message_chunk" }, _meta: { agentTimestampMs: 1700000000900 } }),
      upd({ sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk" }, _meta: { totalTokens: 30, agentTimestampMs: 1700000001000 } }),
    ].join("\n"),
  );
  unified(
    h,
    `{"ts":1700000001000,"pid":1,"sid":"session-1","msg":"shell.turn.inference_done","ctx":{"prompt_tokens":15,"completion_tokens":5}}`,
  );
  const ev = scan(h);
  // Older legacy turn (10) kept; the turn at t=1001 is covered by the unified row.
  assert.deepEqual(ev.map((e) => [e.inputTokens, e.outputTokens]), [[10, 0], [15, 5]]);
  // Unknown unified model recovered from the consistent legacy session model.
  assert.ok(ev.every((e) => e.model === "grok-4.5"));
});

test("grok: since skips old sessions", () => {
  const h = home();
  session(h, upd({ sessionId: "session-1", update: { sessionUpdate: "available_commands_update" }, _meta: { totalTokens: 50, agentTimestampMs: 1700000000000 } }));
  process.env.BURNLOG_GROK_DIR = h;
  const r = new GrokAdapter().scan({ since: new Date(Date.now() + 3600_000) });
  delete process.env.BURNLOG_GROK_DIR;
  assert.equal(r.events.length, 0);
});

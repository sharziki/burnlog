import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AugmentAdapter } from "./augment.js";

function scan(files: Record<string, unknown>, since?: Date) {
  const dir = mkdtempSync(join(tmpdir(), "bl-augment-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  process.env.BURNLOG_AUGMENT_DIR = dir;
  try {
    return { dir, result: new AugmentAdapter().scan({ since }) };
  } finally {
    delete process.env.BURNLOG_AUGMENT_DIR;
  }
}

const usage = (i: number, o: number, r: number, w: number) => ({
  token_usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: w },
});

test("augment: one event per completed turn, cache kept separate", () => {
  const { result } = scan({
    "s1.json": {
      sessionId: "11111111-2222-3333-4444-555555555555",
      agentState: { modelId: "grok-4-5" },
      chatHistory: [
        { completed: true, finishedAt: "2026-01-15T12:01:00.000Z", sequenceId: 1,
          exchange: { model_id: "grok-4-5", request_id: "req-1", response_nodes: [{ type: 1 }, usage(1000, 50, 200, 0)] } },
        { completed: true, finishedAt: "2026-01-15T12:05:00.000Z", sequenceId: 2,
          exchange: { model_id: "claude-opus-4-8", request_id: "req-2", response_nodes: [usage(400, 100, 800, 25)] } },
        { completed: false, finishedAt: "2026-01-15T12:09:00.000Z", exchange: { model_id: "grok-4-5", response_nodes: [] } },
      ],
    },
  });
  assert.equal(result.events.length, 2);
  const [a, b] = result.events;
  assert.equal(a.model, "grok-4-5");
  assert.deepEqual([a.inputTokens, a.outputTokens, a.cacheReadTokens, a.cacheCreationTokens], [1000, 50, 200, 0]);
  assert.equal(a.timestamp, "2026-01-15T12:01:00.000Z");
  assert.equal(b.provider, "anthropic");
  assert.deepEqual([b.inputTokens, b.outputTokens, b.cacheReadTokens, b.cacheCreationTokens], [400, 100, 800, 25]);
  assert.notEqual(a.requestId, b.requestId);
  assert.doesNotMatch(a.requestId, /req-1|1111/);
});

test("augment: falls back to session model; last non-empty usage wins (not summed)", () => {
  const { result } = scan({
    "session-from-name.json": {
      agentState: { modelId: "gpt-5-4" },
      chatHistory: [
        { completed: true, finishedAt: "2026-07-20T13:33:00.000Z", sequenceId: "seq-a",
          exchange: { response_nodes: [usage(100, 10, 50, 0), usage(250, 40, 75, 5), usage(0, 0, 0, 0)] } },
      ],
    },
  });
  assert.equal(result.events.length, 1);
  const e = result.events[0];
  assert.equal(e.model, "gpt-5-4");
  assert.equal(e.provider, "openai");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [250, 40, 75, 5]);
});

test("augment: skips incomplete turns, malformed turns, invalid json", () => {
  const { result } = scan({
    "bad.json": "not json",
    "s2.json": {
      sessionId: "s2",
      chatHistory: [
        "bad-turn",
        { completed: false, exchange: { request_id: "p", response_nodes: [usage(999, 50, 0, 0)] } },
        { exchange: { request_id: "m", response_nodes: [usage(100, 10, 0, 0)] } },
        { completed: true, finishedAt: "2026-07-20T13:33:00.000Z", exchange: { request_id: "ok", response_nodes: [usage(1, 2, 0, 0)] } },
      ],
    },
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].inputTokens, 1);
  assert.equal(result.events[0].outputTokens, 2);
  assert.equal(result.events[0].model, "unknown");
});

test("augment: missing finishedAt falls back to file mtime", () => {
  const { dir, result } = scan({
    "s.json": { sessionId: "s-mtime", chatHistory: [{ completed: true, exchange: { request_id: "r", response_nodes: [usage(3, 1, 0, 0)] } }] },
  });
  const mtime = statSync(join(dir, "s.json")).mtimeMs;
  assert.ok(Math.abs(Date.parse(result.events[0].timestamp) - mtime) < 5000);
});

test("augment: incremental since skips old files; not installed", () => {
  const { result } = scan(
    { "s.json": { sessionId: "x", chatHistory: [{ completed: true, exchange: { request_id: "r", response_nodes: [usage(3, 1, 0, 0)] } }] } },
    new Date(Date.now() + 86_400_000),
  );
  assert.equal(result.events.length, 0);
  process.env.BURNLOG_AUGMENT_DIR = join(tmpdir(), "bl-augment-missing-xyz");
  try {
    assert.equal(new AugmentAdapter().scan().note, "not installed");
  } finally {
    delete process.env.BURNLOG_AUGMENT_DIR;
  }
});

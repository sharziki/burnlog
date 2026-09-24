import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TraeAdapter, normalizeTraeModel, traeProvider } from "./trae.js";

function scan(sessions: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "bl-trae-"));
  writeFileSync(join(dir, "page-1.json"), JSON.stringify(sessions));
  process.env.BURNLOG_TRAE_DIR = dir;
  try {
    return new TraeAdapter().scan();
  } finally {
    delete process.env.BURNLOG_TRAE_DIR;
  }
}

const extra = (i: number, o: number, r: number, w: number) => ({
  input_token: i, output_token: o, cache_read_token: r, cache_write_token: w,
});

test("trae: single session", () => {
  const r = scan([{ model_name: "GPT-5.4", session_id: "test-session-1", usage_time: 1776000000, dollar_float: 0.5, extra_info: extra(1000, 500, 200, 100) }]);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "gpt-5.4");
  assert.equal(e.provider, "openai");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [1000, 500, 200, 100]);
  assert.equal(e.timestamp, new Date(1_776_000_000_000).toISOString());
  assert.doesNotMatch(e.requestId, /test-session/);
});

test("trae: empty, zero-token, missing id / time, overflow are dropped", () => {
  assert.equal(scan([]).events.length, 0);
  const r = scan([
    { model_name: "GPT-5.4", session_id: "empty", usage_time: 1776000000, extra_info: extra(0, 0, 0, 0) },
    { model_name: "GPT-5.4", usage_time: 1776000000, extra_info: extra(100, 1, 0, 0) },
    { model_name: "GPT-5.4", session_id: "abc", extra_info: extra(100, 1, 0, 0) },
    { model_name: "GPT-5.4", session_id: "abc", usage_time: 0, extra_info: extra(100, 1, 0, 0) },
    { model_name: "GPT-5.4", session_id: "evil", usage_time: 9223372036854775807, extra_info: extra(100, 1, 0, 0) },
  ]);
  assert.equal(r.events.length, 0);
});

test("trae: auto mode and unknown model fallbacks; dedupe on (session, time)", () => {
  const rec = { model_name: "", mode: "Auto", session_id: "auto-1", usage_time: 1776000000, extra_info: extra(159213, 210, 6144, 0) };
  const r = scan([rec, rec, { session_id: "no-meta", usage_time: 1776000000, extra_info: extra(100, 1, 0, 0) }]);
  assert.equal(r.events.length, 2);
  assert.equal(r.events[0].model, "trae-auto");
  assert.equal(r.events[0].provider, "other");
  assert.equal(r.events[1].model, "trae-unknown");
});

test("trae: model normalisation and provider mapping", () => {
  assert.equal(normalizeTraeModel("GPT-5.3 Codex"), "gpt-5.3-codex");
  assert.equal(normalizeTraeModel("Gemini 3.1 Pro"), "gemini-3.1-pro");
  assert.equal(normalizeTraeModel("GLM 5.1"), "glm-5.1");
  assert.equal(normalizeTraeModel("Unknown Model"), "Unknown Model");
  assert.equal(traeProvider("Claude Sonnet 4.6"), "anthropic");
  assert.equal(traeProvider("Gemini 3.1 Pro"), "google");
  assert.equal(traeProvider("GLM 5.1"), "other");
});

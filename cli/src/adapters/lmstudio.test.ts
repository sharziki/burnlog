import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LmstudioAdapter, normalizeUsage, parseLmstudioFile } from "./lmstudio.js";

function tmpFile(content: string): string {
  const p = join(mkdtempSync(join(tmpdir(), "bl-lms-")), "x.log");
  writeFileSync(p, content);
  return p;
}

const local = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString();

function padded(i: number, pad: number): string {
  return (
    `[filler] ${"p".repeat(pad)}\n[2026-07-09 10:00:${String(i % 60).padStart(2, "0")}][INFO][fixture-model]\n` +
    `Final response: {"id":"chatcmpl-${i}","model":"fixture-model","usage":{"prompt_tokens":${10 + i},"completion_tokens":5,"total_tokens":${15 + i}}}\n`
  );
}

test("reads every record in a log larger than the window", () => {
  const p = tmpFile(Array.from({ length: 40 }, (_, i) => padded(i, 200)).join(""));
  const events = parseLmstudioFile(p, 512, 64);
  assert.equal(events.length, 40);
  events.forEach((e, i) => {
    assert.equal(e.inputTokens, 10 + i);
    assert.equal(e.requestId, `lmstudio:chatcmpl-${i}`);
  });
});

test("window and chunk sizes do not change the result", () => {
  const p = tmpFile(Array.from({ length: 12 }, (_, i) => padded(i, 300)).join(""));
  const ref = parseLmstudioFile(p);
  assert.equal(ref.length, 12);
  for (const [w, c] of [[512, 1], [1024, 7], [4096, 64], [1 << 20, 1 << 16]]) {
    assert.deepEqual(parseLmstudioFile(p, w, c), ref, `window=${w} chunk=${c}`);
  }
});

test("a response that outgrows the window keeps its identity", () => {
  const body = "b".repeat(4096);
  const p = tmpFile(
    `[2026-07-09 10:00:00][INFO][fixture-model]\nFinal response: {"id":"chatcmpl-far","model":"big-model","choices":[{"text":"${body}"}],"usage":{"prompt_tokens":31,"completion_tokens":7,"total_tokens":38}}\n`,
  );
  const events = parseLmstudioFile(p, 512, 64);
  assert.equal(events.length, 1);
  assert.equal(events[0].requestId, "lmstudio:chatcmpl-far");
  assert.equal(events[0].model, "big-model");
  assert.equal(events[0].inputTokens, 31);
  assert.equal(events[0].timestamp, local(2026, 7, 9, 10, 0, 0));
  assert.deepEqual(events, parseLmstudioFile(p));
});

test("a timestamp printed by the model is not the log time", () => {
  const p = tmpFile(
    `[2026-07-09 10:00:00][INFO][fixture-model]\nFinal response: {"id":"chatcmpl-quoted","model":"fixture-model","choices":[{"text":"the log said [2019-03-04 05:06:07] earlier"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}\n`,
  );
  const events = parseLmstudioFile(p);
  assert.equal(events.length, 1);
  assert.equal(events[0].timestamp, local(2026, 7, 9, 10, 0, 0));
});

test("a record larger than the window does not take the file with it", () => {
  const p = tmpFile(padded(0, 32) + padded(1, 4096) + padded(2, 32));
  const keys = parseLmstudioFile(p, 512, 64).map((e) => e.requestId);
  assert.ok(keys.includes("lmstudio:chatcmpl-0"), String(keys));
  assert.ok(keys.includes("lmstudio:chatcmpl-2"), String(keys));
});

test("exact components from a pretty-printed chat completion", () => {
  const p = tmpFile(`[2026-07-09 10:00:00][INFO][fixture-model]
Final response: {
  "id": "chatcmpl-fixture",
  "model": "fixture-model",
  "choices": [{"message": {"content": "synthetic { braces }"}}],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 12,
    "total_tokens": 112,
    "prompt_tokens_details": {"cached_tokens": 40, "cache_creation_input_tokens": 10}
  }
}
`);
  const [e, ...rest] = parseLmstudioFile(p);
  assert.equal(rest.length, 0);
  assert.equal(e.source, "lmstudio");
  assert.equal(e.provider, "other");
  assert.equal(e.model, "fixture-model");
  assert.equal(e.inputTokens, 50);
  assert.equal(e.outputTokens, 12);
  assert.equal(e.cacheReadTokens, 40);
  assert.equal(e.cacheCreationTokens, 10);
  assert.equal(e.requestId, "lmstudio:chatcmpl-fixture");
});

test("keeps distinct identical usage, skips partial and zero records", () => {
  let s = "";
  for (const id of ["chatcmpl-a", "chatcmpl-b"]) {
    s += `[2026-07-09 11:00:00][INFO][m]\n${JSON.stringify({ id, model: "m", usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } })}\n`;
  }
  s += `{"usage":{"prompt_tokens":0}}\n{"usage":{"prompt_tokens":9`;
  const events = parseLmstudioFile(tmpFile(s));
  assert.equal(events.length, 2);
  assert.notEqual(events[0].requestId, events[1].requestId);
  assert.equal(events.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0), 20);
});

test("responses API usage: reasoning stays inside output", () => {
  const line = JSON.stringify({
    id: "resp_fixture",
    model: "responses-model",
    output: [{ type: "reasoning" }, { type: "message" }],
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      total_tokens: 140,
      input_tokens_details: { cached_tokens: 30 },
      output_tokens_details: { reasoning_tokens: 10 },
    },
  });
  const [e] = parseLmstudioFile(tmpFile(`[2026-07-09 11:30:00][INFO][responses-model]\n${line}\n`));
  assert.equal(e.model, "responses-model");
  assert.equal(e.inputTokens, 70);
  assert.equal(e.outputTokens, 40);
  assert.equal(e.cacheReadTokens, 30);
  assert.equal(e.cacheCreationTokens, 0);
  assert.equal(e.requestId, "lmstudio:resp_fixture");
});

test("response content that looks like metadata is ignored", () => {
  const line = JSON.stringify({
    id: "chatcmpl-real",
    model: "real-model",
    choices: [{ message: { content: '{"id":"chatcmpl-fake","model":"fake-model"}' } }],
    usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
  });
  const [e] = parseLmstudioFile(tmpFile(`[2026-07-09 11:00:00][INFO][real-model]\n${line}\n`));
  assert.equal(e.model, "real-model");
  assert.equal(e.requestId, "lmstudio:chatcmpl-real");
});

test("reported total wins without losing component closure", () => {
  const t = normalizeUsage({
    prompt_tokens: 20,
    completion_tokens: 5,
    total_tokens: 30,
    prompt_tokens_details: { cached_tokens: 8, cache_creation_input_tokens: 2 },
  })!;
  assert.equal(t.input, 15);
  assert.equal(t.input + t.output + t.cacheRead + t.cacheWrite, 30);
});

test("adapter walks nested monthly logs under LM_STUDIO_HOME and dedupes ids", () => {
  const home = mkdtempSync(join(tmpdir(), "bl-lms-home-"));
  const month = join(home, "server-logs", "2026-07");
  mkdirSync(month, { recursive: true });
  writeFileSync(join(month, "a.log"), padded(1, 10));
  writeFileSync(join(month, "b.log"), padded(1, 10) + padded(2, 10));
  const prev = process.env.BURNLOG_LMSTUDIO_DIR;
  process.env.BURNLOG_LMSTUDIO_DIR = home;
  try {
    const a = new LmstudioAdapter();
    assert.ok(a.detect());
    const r = a.scan();
    assert.equal(r.scannedFiles, 2);
    assert.deepEqual(r.events.map((e) => e.requestId).sort(), ["lmstudio:chatcmpl-1", "lmstudio:chatcmpl-2"]);
    assert.equal(a.scan({ since: new Date(Date.now() + 86400_000) }).scannedFiles, 0);
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_LMSTUDIO_DIR;
    else process.env.BURNLOG_LMSTUDIO_DIR = prev;
  }
});

test("not installed", () => {
  const prev = process.env.BURNLOG_LMSTUDIO_DIR;
  process.env.BURNLOG_LMSTUDIO_DIR = join(tmpdir(), "bl-lms-missing-xyz");
  try {
    const r = new LmstudioAdapter().scan();
    assert.equal(r.note, "not installed");
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_LMSTUDIO_DIR;
    else process.env.BURNLOG_LMSTUDIO_DIR = prev;
  }
});

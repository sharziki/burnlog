import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { PiAdapter } from "./pi.js";

function tree(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), "bl-pi-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

function scan(files: Record<string, string | Buffer>) {
  process.env.BURNLOG_PI_DIR = tree(files);
  return new PiAdapter().scan();
}

const header = (id: string) => JSON.stringify({ type: "session", id, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/secret/project" });
const assistant = (id: string, usage: object, extra: object = {}) =>
  JSON.stringify({
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:01.000Z",
    message: { role: "assistant", model: "claude-3-5-sonnet", provider: "anthropic", usage, ...extra },
  });

test("pi: assistant usage maps onto burnlog buckets (tokscale fixture)", () => {
  const r = scan({
    "--tmp--/a.jsonl": [header("pi_ses_001"), assistant("msg_001", { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, totalTokens: 165 })].join("\n"),
  });
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.source, "pi");
  assert.equal(e.model, "claude-3-5-sonnet");
  assert.equal(e.provider, "anthropic");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [100, 50, 10, 5]);
  assert.equal(e.timestamp, "2026-01-01T00:00:01.000Z");
  // Opaque id: no session, entry id or path in it.
  assert.match(e.requestId, /^[0-9a-f]{32}$/);
});

test("pi: reasoning is a subset of output and is not added", () => {
  const r = scan({ "s/a.jsonl": [header("s1"), assistant("b2", { input: 2, output: 43, cacheWrite: 38241, totalTokens: 38286, reasoning: 16 })].join("\n") });
  assert.equal(r.events[0].outputTokens, 43);
});

test("pi: skips non-assistant and usage-less records; infers provider when absent", () => {
  const r = scan({
    "s/a.jsonl": [
      header("s1"),
      JSON.stringify({ type: "message", id: "u", message: { role: "user" } }),
      JSON.stringify({ type: "message", id: "n", timestamp: "2026-01-01T00:00:02Z", message: { role: "assistant", model: "gpt-5" } }),
      JSON.stringify({ type: "message", id: "g", timestamp: "2026-01-01T00:00:03Z", message: { role: "assistant", model: "gpt-5", usage: { input: 1, output: 1 } } }),
    ].join("\n"),
  });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].provider, "openai");
});

test("pi: a fork copy of the same record counts once across files", () => {
  const rec = assistant("m1", { input: 20, output: 8 }, { responseId: "resp_1" });
  const r = scan({ "p/a.jsonl": [header("s1"), rec].join("\n"), "p/b.jsonl": [header("s2-fork"), rec].join("\n") });
  assert.equal(r.events.length, 1);
});

test("pi: title before the header is fine, any other record makes the file foreign", () => {
  const ok = scan({ "p/a.jsonl": [JSON.stringify({ type: "title", title: "x" }), header("s1"), assistant("m", { input: 1, output: 1 })].join("\n") });
  assert.equal(ok.events.length, 1);
  const foreign = scan({ "p/a.jsonl": [JSON.stringify({ type: "message" }), header("s1"), assistant("m", { input: 1, output: 1 })].join("\n") });
  assert.equal(foreign.events.length, 0);
});

test("pi: BOM before the header keeps the transcript; an invalid UTF-8 record is dropped alone", () => {
  const r = scan({
    "p/a.jsonl": Buffer.concat([
      Buffer.from("﻿" + header("bom") + "\n"),
      Buffer.from("invalid \xff record\n", "latin1"),
      Buffer.from(assistant("later", { input: 20, output: 8 }) + "\n"),
    ]),
  });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].inputTokens + r.events[0].outputTokens, 28);
});

test("pi: not installed when the root is missing", () => {
  process.env.BURNLOG_PI_DIR = join(tmpdir(), "bl-pi-does-not-exist");
  const r = new PiAdapter().scan();
  assert.equal(r.note, "not installed");
});

test("pi: since skips files not modified recently", () => {
  const r = (() => {
    process.env.BURNLOG_PI_DIR = tree({ "p/a.jsonl": [header("s1"), assistant("m", { input: 1, output: 1 })].join("\n") });
    return new PiAdapter().scan({ since: new Date(Date.now() + 60 * 60 * 1000) });
  })();
  assert.equal(r.events.length, 0);
  assert.equal(r.scannedFiles, 0);
});

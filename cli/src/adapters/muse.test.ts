import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MuseAdapter, parseMuseFile, recordedAtToMs } from "./muse.js";

const SESSION_ID = "01a0b7d1-b7af-7de2-8369-4f4815ae1d72";

function usageLine(sequence: number, recordedAt: number, model: string, usage: string, durationMs: number): string {
  return `{"schema_version":1,"stream":{"kind":"session","id":"${SESSION_ID}"},"sequence":${sequence},"recorded_at":${recordedAt},"record_type":"event","payload_type":"runtime.session","payload_schema_version":1,"payload":{"kind":"run","run_id":"898f5ab5-88d7-4baa-a281-86040f9d6a57","event":{"kind":"model_completed","usage":${usage},"duration_ms":${durationMs},"finish_reason":"tool_calls","model":"${model}"}}}`;
}

function parseSession(content: string) {
  const dir = join(mkdtempSync(join(tmpdir(), "bl-muse-")), "sessions/2026/09/18", SESSION_ID);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "session.jsonl");
  writeFileSync(p, content);
  return parseMuseFile(p);
}

test("model_completed maps to an event (cache subset of input, reasoning in output)", () => {
  const events = parseSession(
    usageLine(39, 1789790455896395, "muse-spark-1.3-contributor",
      `{"input_tokens":26964,"output_tokens":379,"cached_tokens":5105,"cache_write_tokens":0,"cache_read_tokens":5105,"reasoning_tokens":278}`, 5819),
  );
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.source, "muse");
  assert.equal(e.model, "muse-spark-1.3-contributor");
  assert.equal(e.inputTokens, 26964 - 5105);
  assert.equal(e.cacheReadTokens, 5105);
  assert.equal(e.outputTokens, 379);
  assert.equal(e.cacheCreationTokens, 0);
  assert.equal(e.timestamp, new Date(1789790455896 - 5819).toISOString());
  assert.ok(e.requestId.startsWith("muse:"));
  assert.ok(!e.requestId.includes(SESSION_ID));
});

test("cached_tokens key accepted without cache_read_tokens", () => {
  const [e] = parseSession(
    usageLine(40, 1789790455896395, "muse-spark-1.3", `{"input_tokens":1847,"output_tokens":98,"cached_tokens":1792,"reasoning_tokens":0}`, 100),
  );
  assert.equal(e.inputTokens, 1847 - 1792);
  assert.equal(e.cacheReadTokens, 1792);
  assert.equal(e.outputTokens, 98);
});

test("malformed counts are clamped, not negative", () => {
  const [e] = parseSession(
    usageLine(41, 1789790455896395, "muse-spark-1.3", `{"input_tokens":100,"output_tokens":10,"cache_read_tokens":999,"reasoning_tokens":999}`, 100),
  );
  assert.equal(e.inputTokens, 0);
  assert.equal(e.cacheReadTokens, 100);
  assert.equal(e.outputTokens, 10);
});

test("child lifecycle aggregates, mentions and broken JSON are skipped", () => {
  const content = [
    `{"sequence":282,"recorded_at":1789790455896395,"payload_type":"runtime.session","payload":{"kind":"run","event":{"kind":"workflow_child_lifecycle","status":"usage","usage":{"input_tokens":917394,"output_tokens":5917,"cached_tokens":845908,"cache_read_tokens":845908,"reasoning_tokens":926}}}}`,
    `{"sequence":283,"recorded_at":1789790455896395,"payload_type":"runtime.session","payload":{"kind":"run","event":{"kind":"text","text":"model_completed is the event we parse"}}}`,
    `{"sequence":284,"recorded_at":`,
  ].join("\n");
  assert.equal(parseSession(content).length, 0);
});

test("a replayed identical event collapses to one", () => {
  const line = usageLine(39, 1789790455896395, "muse-spark-1.3-contributor", `{"input_tokens":100,"output_tokens":10,"reasoning_tokens":0}`, 100);
  assert.equal(parseSession(`${line}\n${line}`).length, 1);
});

test("recorded_at unit conversions", () => {
  assert.equal(recordedAtToMs(1789790455896395), 1789790455896);
  assert.equal(recordedAtToMs(1789790455896), 1789790455896);
  assert.equal(recordedAtToMs(1789790455), 1789790455000);
  assert.equal(recordedAtToMs(0), undefined);
  assert.equal(recordedAtToMs(-5), undefined);
});

test("adapter discovers nested sessions and subagents; workspace never leaks", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-muse-root-"));
  const sess = join(root, "sessions/2026/09/18", SESSION_ID);
  const child = join(sess, "subagent/01a0b7df-bac6-75d2-b28e-8dab127205f0");
  mkdirSync(child, { recursive: true });
  writeFileSync(
    join(sess, "session.jsonl"),
    [
      `{"sequence":3,"recorded_at":1789790369778491,"payload_type":"runtime.session.metadata","payload":{"kind":"metadata","record":{"workspace_root":"/home/me/secret-repo","provider_id":"meta","model_id":"muse-spark-1.3-contributor"}}}`,
      usageLine(39, 1789790455896395, "muse-spark-1.3-contributor",
        `{"input_tokens":1000,"output_tokens":250,"cached_tokens":400,"cache_write_tokens":50,"cache_read_tokens":400,"reasoning_tokens":25}`, 1000),
    ].join("\n"),
  );
  writeFileSync(
    join(child, "session.jsonl"),
    usageLine(40, 1789791288021470, "muse-spark-1.3-contributor",
      `{"input_tokens":100,"output_tokens":10,"cached_tokens":0,"cache_write_tokens":0,"cache_read_tokens":0,"reasoning_tokens":0}`, 100)
      .replace(SESSION_ID, "01a0b7df-bac6-75d2-b28e-8dab127205f0"),
  );
  const prev = process.env.BURNLOG_MUSE_DIR;
  process.env.BURNLOG_MUSE_DIR = root;
  try {
    const a = new MuseAdapter();
    assert.ok(a.detect());
    const r = a.scan();
    assert.equal(r.events.length, 2);
    const parent = r.events.find((e) => e.inputTokens === 600)!;
    assert.equal(parent.cacheReadTokens, 400);
    assert.equal(parent.outputTokens, 250);
    assert.equal(parent.cacheCreationTokens, 50);
    assert.ok(!JSON.stringify(r.events).includes("secret-repo"));
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_MUSE_DIR;
    else process.env.BURNLOG_MUSE_DIR = prev;
  }
});

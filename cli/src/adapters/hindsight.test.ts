import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HindsightAdapter } from "./hindsight.js";

const SAMPLE = `{"id":"aa4cc970-33b8-4234-996d-b6e05a5a1bb2","trace_id":"51b96021-07fc-4a64-b333-5c8c72833a44","provider":"ollama-cloud","model":"deepseek-v4-flash:0731","operation":"retain","scope":"retain_extract_facts","started_at":"2026-09-01T08:16:51.357104+00:00","ended_at":"2026-09-01T08:17:43.904885+00:00","duration_ms":52547,"input_tokens":3667,"output_tokens":4063,"cached_tokens":null,"total_tokens":7730,"bank":"omp"}
{"id":"77319709-1e81-400e-8aa9-2e31779f9065","trace_id":"76c6cba6-3dab-43f5-9777-4770202df639","provider":"ollama-cloud","model":"deepseek-v4-flash:0731","operation":"consolidation","scope":"consolidation","started_at":"2026-09-01T08:17:51.558167+00:00","ended_at":"2026-09-01T08:18:48.283320+00:00","duration_ms":56725,"input_tokens":69860,"output_tokens":6532,"cached_tokens":null,"total_tokens":76392,"bank":"omp"}
{"id":"2f85da10-188e-4746-8638-72d3157ae68e","trace_id":"f01c47c4-6283-4631-99bf-b1417a1ce4c1","provider":"ollama-cloud","model":"deepseek-v4-flash:0731","operation":"refresh_mental_model","scope":"reflect_tool_call","started_at":"2026-09-01T12:53:27.493913+00:00","ended_at":"2026-09-01T12:53:50.992949+00:00","duration_ms":23499,"input_tokens":2787,"output_tokens":360,"cached_tokens":null,"total_tokens":3147,"bank":"george"}
{"id":"c18ec2c3-2fa2-47b7-86ab-11be3ee6dd29","trace_id":"e7ba34ff-baf8-42aa-bd7a-b09c127a1df6","provider":"ollama-cloud","model":"deepseek-v4-flash:0731","operation":"retain","scope":"retain_extract_facts","started_at":"2026-09-01T12:55:33.373387+00:00","ended_at":"2026-09-01T12:56:10.594632+00:00","duration_ms":37221,"input_tokens":3586,"output_tokens":3969,"cached_tokens":null,"total_tokens":7555,"bank":"george"}
`;

function scanLedger(files: Record<string, string>) {
  const home = mkdtempSync(join(tmpdir(), "bl-hindsight-"));
  mkdirSync(join(home, "usage"));
  for (const [n, c] of Object.entries(files)) writeFileSync(join(home, "usage", n), c);
  const prev = process.env.BURNLOG_HINDSIGHT_DIR;
  process.env.BURNLOG_HINDSIGHT_DIR = home;
  try {
    return new HindsightAdapter().scan();
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_HINDSIGHT_DIR;
    else process.env.BURNLOG_HINDSIGHT_DIR = prev;
  }
}

test("happy path maps tokens, time and ids, and leaks no labels", () => {
  const r = scanLedger({ "2026-09.jsonl": SAMPLE });
  assert.equal(r.events.length, 4);
  const first = r.events[0];
  assert.equal(first.source, "hindsight");
  assert.equal(first.model, "deepseek-v4-flash:0731");
  assert.equal(first.timestamp, new Date(Date.parse("2026-09-01T08:16:51.357104+00:00")).toISOString());
  assert.equal(first.inputTokens, 3667);
  assert.equal(first.outputTokens, 4063);
  assert.equal(first.cacheReadTokens, 0);
  assert.equal(first.cacheCreationTokens, 0);
  assert.equal(first.requestId, "hindsight:aa4cc970-33b8-4234-996d-b6e05a5a1bb2");
  assert.equal(r.events[2].inputTokens, 2787);
  assert.equal(r.events[2].outputTokens, 360);
  const s = JSON.stringify(r.events);
  for (const leak of ["omp", "george", "retain", "consolidation"]) assert.ok(!s.includes(`"${leak}`), leak);
  assert.equal(new Set(r.events.map((e) => e.requestId)).size, 4);
});

test("malformed and garbage lines are skipped", () => {
  const r = scanLedger({
    "2026-09.jsonl": `not json at all\n{"id":123}\n\n${SAMPLE}{"id":"trailing-broken-json"\n`,
  });
  assert.equal(r.events.length, 4);
});

test("null/missing cached tokens are zero; negative and failed calls dropped", () => {
  const base = `"provider":"ollama-cloud","model":"deepseek-v4-flash:0731","started_at":"2026-09-01T08:16:51.357104+00:00"`;
  const r = scanLedger({
    "a.jsonl": [
      `{"id":"test-null-cache",${base},"input_tokens":100,"output_tokens":50,"cached_tokens":null}`,
      `{"id":"test-omitted-cache",${base},"input_tokens":200,"output_tokens":75}`,
      `{"id":"test-negative-tokens",${base},"input_tokens":-10,"output_tokens":-5,"cached_tokens":-1}`,
      `{"id":"test-failed-call",${base},"input_tokens":null,"output_tokens":null,"cached_tokens":null,"total_tokens":null}`,
    ].join("\n"),
  });
  assert.equal(r.events.length, 2);
  assert.deepEqual(
    r.events.map((e) => [e.inputTokens, e.outputTokens, e.cacheReadTokens]),
    [[100, 50, 0], [200, 75, 0]],
  );
});

test("unparseable started_at is skipped", () => {
  const base = `"provider":"ollama-cloud","model":"m","input_tokens":100,"output_tokens":50`;
  const r = scanLedger({
    "a.jsonl": [
      `{"id":"test-missing-time",${base}}`,
      `{"id":"test-invalid-time",${base},"started_at":"not-a-timestamp"}`,
      `{"id":"test-valid-time",${base},"started_at":"2026-09-01T08:16:51.357104+00:00"}`,
    ].join("\n"),
  });
  assert.deepEqual(r.events.map((e) => e.requestId), ["hindsight:test-valid-time"]);
});

test("not installed without a ledger", () => {
  const prev = process.env.BURNLOG_HINDSIGHT_DIR;
  process.env.BURNLOG_HINDSIGHT_DIR = join(tmpdir(), "bl-hindsight-missing-xyz");
  try {
    assert.match(new HindsightAdapter().scan().note ?? "", /not installed/);
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_HINDSIGHT_DIR;
    else process.env.BURNLOG_HINDSIGHT_DIR = prev;
  }
});

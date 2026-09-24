import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CopilotDesktopAdapter, desktopTs, parseCopilotDesktop } from "./copilot-desktop.js";

const SCHEMA = `CREATE TABLE sessions (id TEXT, title TEXT, session_type TEXT, mode TEXT, model TEXT,
  total_input_tokens INTEGER, total_output_tokens INTEGER, total_cached_tokens INTEGER,
  total_reasoning_tokens INTEGER, total_nano_aiu INTEGER, created_at TEXT, agent TEXT, provider_id TEXT);`;

const CREATED = 1_782_909_296_000; // 2026-07-01T12:34:56Z
const D0701_20 = 1_782_936_000_000;
const D0702 = 1_782_950_400_000;
const START = `{"type":"session.start","data":{},"id":"3f0a1c22-6b41-4d0e-9c7a-5e2b8d4f1a00","timestamp":"2026-07-01T19:00:00.000Z"}`;

function shutdown(id: string | null, ts: string, metrics: string, extra = ""): string {
  const idPart = id ? `"id":"${id}",` : "";
  return `{"type":"session.shutdown","data":{${extra}"modelMetrics":${metrics}},${idPart}"timestamp":"${ts}","parentId":null}`;
}

function setup(model: string, i: number, o: number, c: number, r: number, events?: string[] | Buffer): { dir: string; db: string } {
  const dir = mkdtempSync(join(tmpdir(), "bl-cpd-"));
  const db = join(dir, "data.db");
  execFileSync("sqlite3", [
    db,
    SCHEMA +
      `INSERT INTO sessions VALUES ('session-1','Secret title','chat','agent','${model}',${i},${o},${c},${r},0,'2026-07-01T12:34:56Z','github.copilot.default','github-copilot');`,
  ]);
  if (events) {
    const ed = join(dir, "session-state", "session-1");
    mkdirSync(ed, { recursive: true });
    writeFileSync(join(ed, "events.jsonl"), Array.isArray(events) ? events.join("\n") + "\n" : events);
  }
  return { dir, db };
}

const sum = (rs: Awaited<ReturnType<typeof parseCopilotDesktop>>, k: "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning") =>
  rs.reduce((a, r) => a + r.tokens[k], 0);

test("reads token sessions, moving cache reads out of input", async () => {
  const { db } = setup("gpt-5.1-codex", 100, 50, 25, 10);
  const rs = await parseCopilotDesktop(db);
  assert.equal(rs.length, 1);
  assert.deepEqual(rs[0].tokens, { input: 75, output: 50, cacheRead: 25, cacheWrite: 0, reasoning: 10 });
  assert.equal(rs[0].timestampMs, CREATED);
  assert.equal(rs[0].key, "copilot-desktop:session-1");
});

test("skips zero-token sessions", async () => {
  assert.equal((await parseCopilotDesktop(setup("gpt-5.1-codex", 0, 0, 0, 0).db)).length, 0);
});

test("model from session.model_change, even after an undecodable line", async () => {
  const buf = Buffer.concat([
    Buffer.from(`{"type":"session.start","data":{"context":{"cwd":"/Users/alice/project"}}}\n`),
    Buffer.from([0x7b, 0xff, 0xfe, 0x0a]),
    Buffer.from(`{"type":"session.model_change","data":{"newModel":"claude-sonnet-4-5"}}\n`),
  ]);
  const rs = await parseCopilotDesktop(setup("auto", 100, 50, 0, 0, buf).db);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].model, "claude-sonnet-4-5");
});

test("shutdown usage lands on the shutdown's own timestamp", async () => {
  const { db } = setup("gpt-5.1-codex", 100, 50, 25, 10, [
    START,
    shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50,"cacheReadTokens":25,"cacheWriteTokens":7,"reasoningTokens":10}}}`),
  ]);
  const rs = await parseCopilotDesktop(db);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].timestampMs, D0702);
  assert.deepEqual(rs[0].tokens, { input: 75, output: 50, cacheRead: 25, cacheWrite: 7, reasoning: 10 });
  assert.equal(rs[0].key, "copilot-desktop:session-1:shutdown:ev-2:gpt-5.1-codex");
});

test("usage beyond the shutdowns stays at creation as a residual", async () => {
  const { db } = setup("gpt-5.1-codex", 200, 100, 50, 20, [
    START,
    shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50,"cacheReadTokens":25,"reasoningTokens":10}}}`),
  ]);
  const rs = await parseCopilotDesktop(db);
  assert.equal(rs.length, 2);
  const residual = rs.find((r) => r.timestampMs === CREATED)!;
  assert.deepEqual(residual.tokens, { input: 75, output: 50, cacheRead: 25, cacheWrite: 0, reasoning: 10 });
  assert.equal(residual.key, "copilot-desktop:session-1");
  assert.equal(sum(rs, "input"), 150);
});

test("splits per model; auto keeps the model active for each run", async () => {
  const a = await parseCopilotDesktop(
    setup("auto", 300, 60, 0, 0, [
      START,
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":20}},"claude-sonnet-4-5":{"usage":{"inputTokens":200,"outputTokens":40}}}`),
    ]).db,
  );
  assert.equal(a.find((r) => r.model === "gpt-5.1-codex")!.tokens.input, 100);
  assert.equal(a.find((r) => r.model === "claude-sonnet-4-5")!.tokens.input, 200);

  const b = await parseCopilotDesktop(
    setup("auto", 200, 0, 0, 0, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"auto":{"usage":{"inputTokens":100}}}`, `"currentModel":"gpt-5.1-codex",`),
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"auto":{"usage":{"inputTokens":200}}}`, `"currentModel":"claude-sonnet-4-5",`),
    ]).db,
  );
  const first = b.find((r) => r.timestampMs === D0701_20)!;
  const second = b.find((r) => r.timestampMs === D0702)!;
  assert.deepEqual([first.model, first.tokens.input], ["gpt-5.1-codex", 100]);
  assert.deepEqual([second.model, second.tokens.input], ["claude-sonnet-4-5", 100]);
});

test("real shutdown record shape", async () => {
  const { db } = setup("gpt-5.4", 21_067, 29, 19_968, 22, [
    START,
    `{"type":"session.shutdown","data":{"shutdownType":"routine","totalPremiumRequests":1,"modelMetrics":{"gpt-5.4":{"requests":{"count":1,"cost":1},"usage":{"inputTokens":21067,"outputTokens":29,"cacheReadTokens":19968,"cacheWriteTokens":0,"reasoningTokens":22}}},"currentModel":"gpt-5.4"},"id":"c1a4b7e2-90d3-4f61-8ba5-7d2e6f0c9134","timestamp":"2026-04-14T18:43:44.922Z","parentId":"5b8f3d10"}`,
  ]);
  const rs = await parseCopilotDesktop(db);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].timestampMs, 1_776_192_224_922);
  assert.deepEqual(rs[0].tokens, { input: 1_099, output: 29, cacheRead: 19_968, cacheWrite: 0, reasoning: 22 });
});

test("cumulative snapshots are differenced, not summed; keys survive rotation", async () => {
  const s1 = shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50}}}`);
  const s2 = shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":200,"outputTokens":100}}}`);
  const rs = await parseCopilotDesktop(setup("gpt-5.1-codex", 200, 100, 0, 0, [START, s1, s2]).db);
  assert.deepEqual([sum(rs, "input"), sum(rs, "output")], [200, 100]);
  assert.deepEqual(rs.find((r) => r.timestampMs === D0701_20)!.tokens.input, 100);
  assert.deepEqual(rs.find((r) => r.timestampMs === D0702)!.tokens.input, 100);
  assert.ok(!rs.some((r) => r.key === "copilot-desktop:session-1"));

  const rotated = await parseCopilotDesktop(setup("gpt-5.1-codex", 200, 100, 0, 0, [START, s2]).db);
  assert.equal(rotated.find((r) => r.timestampMs === D0702)!.key, "copilot-desktop:session-1:shutdown:ev-2:gpt-5.1-codex");
  assert.equal(sum(rotated, "input"), 200);
});

test("a lost log head makes the survivor a baseline, not new usage", async () => {
  const s2 = shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":200,"outputTokens":60}}}`);
  const rs = await parseCopilotDesktop(setup("gpt-5.1-codex", 200, 60, 0, 0, [s2]).db);
  const total = rs.reduce((a, r) => a + r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite + r.tokens.reasoning, 0);
  assert.equal(total, 0);
});

test("id-less shutdowns at the same instant keep distinct keys; repeats count once", async () => {
  const rs = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 200, 0, 0, 0, [
      START,
      shutdown(null, "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100}}}`, `"p":"a",`),
      shutdown(null, "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":200}}}`, `"p":"b",`),
    ]).db,
  );
  assert.equal(rs.length, 2);
  assert.equal(new Set(rs.map((r) => r.key)).size, 2);
  assert.ok(rs.every((r) => r.key.includes(":shutdown:anon-")));

  const rec = shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50}}}`);
  const once = await parseCopilotDesktop(setup("gpt-5.1-codex", 100, 50, 0, 0, [START, rec, rec]).db);
  assert.equal(once.length, 1);
  assert.deepEqual([once[0].tokens.input, once[0].tokens.output], [100, 50]);
});

test("decreasing snapshot adds nothing; bounded by the row; cache never mints tokens", async () => {
  const dec = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 200, 100, 0, 0, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":200,"outputTokens":100}}}`),
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":50,"outputTokens":20}}}`),
    ]).db,
  );
  assert.deepEqual([sum(dec, "input"), sum(dec, "output")], [200, 100]);
  assert.ok(!dec.some((r) => r.timestampMs === D0702));

  const bounded = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 100, 50, 25, 10, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":200,"outputTokens":100,"cacheReadTokens":80,"cacheWriteTokens":7,"reasoningTokens":20}}}`),
    ]).db,
  );
  assert.equal(bounded.length, 1);
  assert.deepEqual(bounded[0].tokens, { input: 75, output: 50, cacheRead: 25, cacheWrite: 7, reasoning: 10 });

  const cache = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 100, 0, 90, 0, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"cacheReadTokens":80}}}`),
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":90,"cacheReadTokens":90}}}`),
    ]).db,
  );
  assert.equal(sum(cache, "input") + sum(cache, "cacheRead"), 100);
  assert.equal(sum(cache, "cacheRead"), 90);
  assert.ok(!cache.some((r) => r.timestampMs === D0702));
});

test("re-attribution conserves the row total; padded model names share one series", async () => {
  const rs = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 200, 100, 50, 20, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50,"cacheReadTokens":25,"reasoningTokens":10}}}`),
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":150,"outputTokens":75,"cacheReadTokens":40,"reasoningTokens":15}}}`),
    ]).db,
  );
  assert.equal(sum(rs, "input") + sum(rs, "cacheRead"), 200);
  assert.equal(sum(rs, "output"), 100);
  assert.equal(sum(rs, "cacheRead"), 50);
  assert.equal(sum(rs, "reasoning"), 20);
  assert.deepEqual(rs.map((r) => r.timestampMs).sort(), [CREATED, D0701_20, D0702]);

  const padded = await parseCopilotDesktop(
    setup("gpt-5.1-codex", 200, 100, 0, 0, [
      START,
      shutdown("ev-1", "2026-07-01T20:00:00.000Z", `{"gpt-5.1-codex":{"usage":{"inputTokens":100,"outputTokens":50}}}`),
      shutdown("ev-2", "2026-07-02T00:00:00.000Z", `{" gpt-5.1-codex ":{"usage":{"inputTokens":200,"outputTokens":100}}}`),
    ]).db,
  );
  assert.deepEqual([sum(padded, "input"), sum(padded, "output")], [200, 100]);
  assert.deepEqual(padded.map((r) => r.key).sort(), [
    "copilot-desktop:session-1:shutdown:ev-1:gpt-5.1-codex",
    "copilot-desktop:session-1:shutdown:ev-2:gpt-5.1-codex",
  ]);
});

test("timestamp formats", () => {
  assert.equal(desktopTs("2026-07-01 12:34:56.789"), 1_782_909_296_789);
  assert.equal(desktopTs("2026-07-01T12:34:56Z"), CREATED);
  assert.equal(desktopTs("2026-07-01 12:34:56"), CREATED);
  assert.equal(desktopTs("not-a-timestamp"), undefined);
});

test("adapter: hashed ids, output includes reasoning, no title leaks", async () => {
  const { dir } = setup("gpt-5.1-codex", 100, 50, 25, 10);
  process.env.BURNLOG_COPILOT_DIR = dir;
  try {
    const res = await new CopilotDesktopAdapter().scan();
    assert.equal(res.events.length, 1);
    const e = res.events[0];
    assert.match(e.requestId, /^[0-9a-f]{32}$/);
    assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [75, 60, 25, 0]);
    assert.equal(e.provider, "openai");
    assert.ok(!JSON.stringify(res).includes("Secret"));
  } finally {
    delete process.env.BURNLOG_COPILOT_DIR;
  }
});

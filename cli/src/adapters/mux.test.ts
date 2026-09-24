import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MuxAdapter } from "./mux.js";

function setup(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bl-mux-"));
  for (const [ws, body] of Object.entries(files)) {
    mkdirSync(join(root, ws), { recursive: true });
    writeFileSync(join(root, ws, "session-usage.json"), body);
  }
  process.env.BURNLOG_MUX_DIR = root;
  return root;
}

const scan = (since?: Date) => new MuxAdapter().scan({ since });

test("mux: one event per model, provider prefix stripped, disjoint buckets", () => {
  setup({
    ws_a: JSON.stringify({
      version: 1,
      byModel: {
        "anthropic:claude-opus-4-6": {
          input: { tokens: 100, cost_usd: 0.01 },
          cached: { tokens: 5000, cost_usd: 0.05 },
          cacheCreate: { tokens: 200, cost_usd: 0.02 },
          output: { tokens: 300, cost_usd: 0.03 },
          reasoning: { tokens: 7, cost_usd: 0 },
        },
        "openai:gpt-4o": {
          input: { tokens: 50 },
          cached: { tokens: 0 },
          cacheCreate: { tokens: 0 },
          output: { tokens: 150 },
          reasoning: { tokens: 0 },
        },
      },
      lastRequest: { model: "anthropic:claude-opus-4-6", timestamp: 1700000000000 },
    }),
  });
  const r = scan();
  assert.equal(r.events.length, 2);
  const c = r.events.find((e) => e.model === "claude-opus-4-6")!;
  assert.equal(c.provider, "anthropic");
  assert.equal(c.source, "mux");
  assert.deepEqual([c.inputTokens, c.outputTokens, c.cacheReadTokens, c.cacheCreationTokens], [100, 307, 5000, 200]);
  assert.equal(c.timestamp, new Date(1700000000000).toISOString());
  const g = r.events.find((e) => e.model === "gpt-4o")!;
  assert.equal(g.provider, "openai");
  assert.deepEqual([g.inputTokens, g.outputTokens], [50, 150]);
});

test("mux: empty/missing byModel, zero entries, invalid json are skipped; negatives clamp", () => {
  setup({
    empty: `{ "version": 1, "byModel": {} }`,
    missing: `{ "version": 1 }`,
    bad: "not json at all",
    zero: JSON.stringify({ byModel: { "anthropic:claude-opus-4-6": { input: { tokens: 0 }, output: { tokens: 0 } } } }),
    neg: JSON.stringify({
      byModel: { "anthropic:claude-opus-4-6": { input: { tokens: -50 }, output: { tokens: 100 } } },
      lastRequest: { timestamp: 1700000000000 },
    }),
  });
  const r = scan();
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].inputTokens, 0);
  assert.equal(r.events[0].outputTokens, 100);
});

test("mux: no provider prefix, multi-colon keys, stable per-workspace ids", () => {
  const body = JSON.stringify({
    byModel: {
      "claude-opus-4-6": { input: { tokens: 100 }, output: { tokens: 200 } },
      "provider:sub:model-name": { input: { tokens: 100 }, output: { tokens: 200 } },
    },
    lastRequest: { timestamp: 1700000000000 },
  });
  setup({ ws_alpha: body, ws_beta: body });
  const r = scan();
  assert.equal(r.events.length, 4, "same model in two workspaces must not share an id");
  assert.ok(r.events.some((e) => e.model === "claude-opus-4-6" && e.provider === "anthropic"));
  assert.ok(r.events.some((e) => e.model === "sub:model-name"));
  const again = scan();
  assert.deepEqual(
    r.events.map((e) => e.requestId).sort(),
    again.events.map((e) => e.requestId).sort(),
  );
  for (const e of r.events) assert.ok(!e.requestId.includes("ws_"), "id must not leak the workspace name");
});

test("mux: timestamp falls back to mtime; since skips stale files; not installed", () => {
  const root = setup({ ws: JSON.stringify({ byModel: { "x:m": { output: { tokens: 5 } } } }) });
  const old = new Date("2024-01-01T00:00:00Z");
  utimesSync(join(root, "ws", "session-usage.json"), old, old);
  const r = scan();
  assert.equal(r.events[0].timestamp, old.toISOString());
  assert.equal(scan(new Date("2025-01-01T00:00:00Z")).events.length, 0);

  process.env.BURNLOG_MUX_DIR = join(root, "nope");
  assert.equal(new MuxAdapter().detect(), false);
  assert.equal(scan().note, "not installed");
});

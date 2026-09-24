import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FxAdapter } from "./fx.js";

type Session = { usage: string; meta?: string };

function setup(sessions: Record<string, Session>, index?: string): string {
  const root = mkdtempSync(join(tmpdir(), "bl-fx-"));
  for (const [id, s] of Object.entries(sessions)) {
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "usage-v2.json"), s.usage);
    if (s.meta) writeFileSync(join(dir, "session.json"), s.meta);
  }
  if (index) writeFileSync(join(root, "index.json"), index);
  process.env.BURNLOG_FX_DIR = root;
  return root;
}

const scan = (since?: Date) => new FxAdapter().scan({ since });
const META = `{"workspace_root":"/Users/alice/repo","updated_at_ms":1787196905040}`;

test("fx: provider-prefixed model -> one event, reasoning added to output", () => {
  setup(
    {
      "sess-123": {
        meta: META,
        usage: `{"schema_version":1,"session_id":"sess-123","snapshot":{"schema_version":2,"total_cost":0.01,"request_count":2,
          "models":[{"model":"zai/glm-5.2","total_cost":0.01,"input_tokens":1539,"output_tokens":441,"cache_read_tokens":1069,"cache_write_tokens":7,"reasoning_tokens":3,"request_count":2}]}}`,
      },
    },
    `{"sessions":[{"id":"sess-123","title":"Setup CI"}]}`,
  );
  const r = scan();
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.source, "fx");
  assert.equal(e.model, "glm-5.2");
  assert.equal(e.provider, "other");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [1539, 444, 1069, 7]);
  assert.equal(e.timestamp, new Date(1787196905040).toISOString());
  const blob = JSON.stringify(e);
  assert.ok(!blob.includes("Setup CI") && !blob.includes("alice") && !blob.includes("sess-123"));
});

test("fx: synthetic fx-unknown from top-level aggregates, no double count when models present", () => {
  setup({
    "sess-456": {
      meta: META,
      usage: `{"session_id":"sess-456","snapshot":{"total_cost":0.014,"input_tokens":2000,"output_tokens":800,"cache_read_tokens":500,"cache_write_tokens":10,"reasoning_tokens":120,"request_count":3,"models":[]}}`,
    },
    s: {
      usage: `{"session_id":"s","snapshot":{"total_cost":0.02,"input_tokens":3000,"output_tokens":1000,"request_count":4,
        "models":[{"model":"zai/glm-5.2","total_cost":0.02,"input_tokens":3000,"output_tokens":1000,"request_count":4}]}}`,
    },
  });
  const r = scan();
  assert.equal(r.events.length, 2);
  const u = r.events.find((e) => e.model === "fx-unknown")!;
  assert.deepEqual([u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheCreationTokens], [2000, 920, 500, 10]);
  const g = r.events.find((e) => e.model === "glm-5.2")!;
  assert.deepEqual([g.inputTokens, g.outputTokens], [3000, 1000]);
});

test("fx: null fields tolerated, zero entries and empty sessions skipped, missing meta uses mtime", () => {
  const root = setup({
    s3: {
      usage: `{"session_id":"s3","snapshot":{"models":[{"model":"anthropic/claude-sonnet-4","total_cost":0.001,"input_tokens":10,"output_tokens":5,"reasoning_tokens":null,"request_count":null}]}}`,
    },
    zero: { usage: `{"session_id":"z","snapshot":{"models":[{"model":"zai/glm-5.2","input_tokens":0,"output_tokens":0}]}}` },
    empty: { usage: `{"session_id":"empty","snapshot":{"models":[],"request_count":0,"total_cost":0}}` },
    nosnap: { usage: `{"session_id":"n"}` },
  });
  const old = new Date("2024-02-02T00:00:00Z");
  utimesSync(join(root, "s3", "usage-v2.json"), old, old);
  const r = scan();
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].provider, "anthropic");
  assert.equal(r.events[0].model, "claude-sonnet-4");
  assert.equal(r.events[0].outputTokens, 5);
  assert.equal(r.events[0].timestamp, old.toISOString());
  assert.equal(scan(new Date("2025-01-01T00:00:00Z")).events.length, 0);
});

test("fx: not installed", () => {
  process.env.BURNLOG_FX_DIR = join(tmpdir(), "bl-fx-missing-" + process.pid);
  assert.equal(new FxAdapter().detect(), false);
  assert.equal(scan().note, "not installed");
});

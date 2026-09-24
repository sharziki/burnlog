import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { RoocodeAdapter } from "./roocode.js";
import { modelFromHistory } from "./vscode-tasks.js";

function scanTasks(tasks: Record<string, { ui: string; history?: string }>) {
  const dir = mkdtempSync(join(tmpdir(), "bl-roo-"));
  for (const [id, t] of Object.entries(tasks)) {
    mkdirSync(join(dir, id));
    writeFileSync(join(dir, id, "ui_messages.json"), t.ui);
    if (t.history) writeFileSync(join(dir, id, "api_conversation_history.json"), t.history);
  }
  process.env.BURNLOG_ROOCODE_DIR = dir;
  try {
    return new RoocodeAdapter().scan();
  } finally {
    delete process.env.BURNLOG_ROOCODE_DIR;
  }
}

const req = (payload: object, extra: object = {}, ts: unknown = "2026-02-18T12:00:00Z") => ({
  type: "say",
  say: "api_req_started",
  ts,
  text: JSON.stringify(payload),
  ...extra,
});

test("roocode: api_req_started rows map 1:1, model from history tag", () => {
  const r = scanTasks({
    "task-abc": {
      ui: JSON.stringify([
        req({ cost: 0.12, tokensIn: 100, tokensOut: 50, cacheReads: 20, cacheWrites: 5, apiProtocol: "anthropic" }),
        { type: "say", say: "assistant_message", ts: "2026-02-18T12:00:01Z", text: "{}" },
      ]),
      history: "before\n<environment_details>\n<model>claude-sonnet-4</model>\n<slug>architect</slug>\n</environment_details>\nafter",
    },
  });
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.source, "roocode");
  assert.equal(e.model, "claude-sonnet-4");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 100);
  assert.equal(e.outputTokens, 50);
  assert.equal(e.cacheReadTokens, 20);
  assert.equal(e.cacheCreationTokens, 5);
  assert.equal(e.timestamp, "2026-02-18T12:00:00.000Z");
  assert.match(e.requestId, /^[0-9a-f]{32}$/);
});

test("roocode: per-row modelInfo wins and labels each row", () => {
  const r = scanTasks({
    "task-switch": {
      ui: JSON.stringify([
        req({ tokensIn: 10, tokensOut: 1, apiProtocol: "openai" }, { modelInfo: { providerId: "openai", modelId: "gpt-5.1" } }),
        req({ tokensIn: 20, tokensOut: 2 }, { modelInfo: { providerId: "anthropic", modelId: "claude-sonnet-5" } }, 1789022955199),
      ]),
      history: "<environment_details><model>ignored</model></environment_details>",
    },
  });
  const byModel = Object.fromEntries(r.events.map((e) => [e.model, e]));
  assert.equal(r.events.length, 2);
  assert.equal(byModel["gpt-5.1"].provider, "openai");
  assert.equal(byModel["claude-sonnet-5"].provider, "anthropic");
  assert.equal(byModel["claude-sonnet-5"].timestamp, new Date(1789022955199).toISOString());
});

test("roocode: blank modelInfo falls back to legacy; nested protocol resolves", () => {
  const r = scanTasks({
    "task-blank": {
      ui: JSON.stringify([req({ tokensIn: 100, tokensOut: 50, apiProtocol: "bedrock/anthropic" }, { modelInfo: { providerId: "", modelId: "  " } })]),
      history: "<environment_details>\n<model>claude-sonnet-4</model>\n</environment_details>",
    },
  });
  assert.equal(r.events[0].model, "claude-sonnet-4");
  assert.equal(r.events[0].provider, "anthropic");
});

test("roocode: malformed payload, bad timestamp, zero rows and bad files are skipped", () => {
  const r = scanTasks({
    "task-def": {
      ui: JSON.stringify([
        { type: "say", say: "api_req_started", ts: "2026-02-18T12:00:00Z", text: "not-json" },
        req({ tokensIn: 10, tokensOut: 2, cacheReads: 1, apiProtocol: "openai" }, {}, "2026-02-18T12:00:02Z"),
        req({ tokensIn: 100, tokensOut: 50 }, {}, "not-a-time"),
        req({ request: "<task>…</task>" }, {}, "2026-02-18T12:00:03Z"),
      ]),
    },
    "task-invalid": { ui: "{not-json" },
  });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "unknown");
  assert.equal(r.events[0].provider, "openai");
});

test("roocode: history helper takes the last model tag", () => {
  const h = "<environment_details><model>gpt-5</model></environment_details>\n<environment_details><model>gpt-5.1</model></environment_details>";
  assert.equal(modelFromHistory(h), "gpt-5.1");
  assert.equal(modelFromHistory("<model>outside</model>"), undefined);
});

test("roocode: not installed", () => {
  process.env.BURNLOG_ROOCODE_DIR = join(tmpdir(), "bl-roo-nope-xyz");
  try {
    assert.equal(new RoocodeAdapter().scan().note, "not installed");
  } finally {
    delete process.env.BURNLOG_ROOCODE_DIR;
  }
});

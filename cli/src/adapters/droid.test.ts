import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DroidAdapter, normalizeDroidModel } from "./droid.js";

function withDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "bl-droid-"));
  process.env.BURNLOG_DROID_DIR = dir;
  try {
    return fn(dir);
  } finally {
    delete process.env.BURNLOG_DROID_DIR;
  }
}

test("droid: model normalization matches tokscale", () => {
  assert.equal(normalizeDroidModel("custom:Claude-Opus-4.5-Thinking-[Anthropic]-0"), "claude-opus-4-5-thinking-0");
  assert.equal(normalizeDroidModel("gemini-2.5-pro"), "gemini-2-5-pro");
  assert.equal(normalizeDroidModel("Claude-Sonnet-4-[Anthropic]"), "claude-sonnet-4");
});

test("droid: one event per session with cumulative totals, thinking in output", () => {
  withDir((dir) => {
    const proj = join(dir, "-home-me-project");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.settings.json"),
      JSON.stringify({
        model: "custom:Claude-Opus-4.5-Thinking-[Anthropic]-0",
        providerLock: "anthropic",
        providerLockTimestamp: "2020-01-01T00:00:00Z",
        tokenUsage: { inputTokens: 900, outputTokens: 100, cacheCreationTokens: 50, cacheReadTokens: 5000, thinkingTokens: 25 },
      }),
    );
    // zero usage and missing usage are skipped
    writeFileSync(join(dir, "zero.settings.json"), JSON.stringify({ tokenUsage: { inputTokens: 0 } }));
    writeFileSync(join(dir, "none.settings.json"), JSON.stringify({ model: "x" }));
    writeFileSync(join(dir, "broken.settings.json"), "{");

    const r = new DroidAdapter().scan();
    assert.equal(r.events.length, 1);
    const e = r.events[0];
    assert.equal(e.source, "droid");
    assert.equal(e.model, "claude-opus-4-5-thinking-0");
    assert.equal(e.provider, "anthropic");
    assert.equal(e.inputTokens, 900);
    assert.equal(e.outputTokens, 125);
    assert.equal(e.cacheCreationTokens, 50);
    assert.equal(e.cacheReadTokens, 5000);
    assert.match(e.requestId, /^[0-9a-f]{32}$/);
    assert.ok(!e.requestId.includes("aaaaaaaa"));
    // mtime (now) wins over the older provider-lock timestamp
    assert.ok(Date.parse(e.timestamp) > Date.parse("2025-01-01T00:00:00Z"));
  });
});

test("droid: model falls back to transcript, then provider default", () => {
  withDir((dir) => {
    writeFileSync(join(dir, "s1.settings.json"), JSON.stringify({ tokenUsage: { inputTokens: 1 } }));
    writeFileSync(
      join(dir, "s1.jsonl"),
      [
        JSON.stringify({ type: "session_start" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "<system-reminder>Model: Claude Opus 4.5 Thinking [Anthropic]</system-reminder>" } }),
      ].join("\n"),
    );
    writeFileSync(join(dir, "s2.settings.json"), JSON.stringify({ providerLock: "openai", tokenUsage: { outputTokens: 2 } }));
    const models = new DroidAdapter()
      .scan()
      .events.map((e) => e.model)
      .sort();
    assert.deepEqual(models, ["claude opus 4-5 thinking", "gpt-unknown"]);
  });
});

test("droid: provider lock later than mtime floors the timestamp", () => {
  withDir((dir) => {
    const f = join(dir, "s.settings.json");
    writeFileSync(f, JSON.stringify({ model: "gpt-5", providerLockTimestamp: "2026-03-01T00:00:00Z", tokenUsage: { inputTokens: 3 } }));
    const old = new Date("2026-02-01T00:00:00Z");
    utimesSync(f, old, old);
    const e = new DroidAdapter().scan().events[0];
    assert.equal(e.timestamp, "2026-03-01T00:00:00.000Z");
    assert.equal(e.provider, "openai");
    assert.equal(new DroidAdapter().scan({ since: new Date() }).events.length, 0);
  });
});

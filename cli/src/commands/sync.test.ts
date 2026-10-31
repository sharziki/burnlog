import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const root = mkdtempSync(join(tmpdir(), "bl-sync-"));
process.env.HOME = root;
process.env.USERPROFILE = root;
process.env.XDG_DATA_HOME = join(root, "xdg-data");
process.env.XDG_CONFIG_HOME = join(root, "xdg-config");
process.env.XDG_STATE_HOME = join(root, "xdg-state");
process.env.BURNLOG_CLAUDE_DIR = join(root, "claude");
process.env.BURNLOG_CODEX_DIR = join(root, "codex");
process.env.BURNLOG_API_URL = "https://burnlog.test";
process.env.NO_COLOR = "1";

test("failed first batch retains checkpoint and retries all 501 records", async () => {
  const { runSync } = await import("./sync.js");
  const { saveConfig, loadConfig } = await import("../config.js");
  saveConfig({ apiUrl: "https://burnlog.test", apiKey: "blg_test", claudeProjectsDir: root });
  const dir = join(root, "claude", "project", "session", "subagents");
  mkdirSync(dir, { recursive: true });
  const records = Array.from({ length: 501 }, (_, i) => JSON.stringify({
    type: "assistant", requestId: `req-${i}`, timestamp: "2026-10-02T00:00:00Z",
    message: { model: "claude-sonnet-4", usage: { input_tokens: 100, output_tokens: 20 } },
  }));
  writeFileSync(join(dir, "agent-a.jsonl"), records.join("\n") + "\n");
  const original = globalThis.fetch;
  const batches: number[] = [];
  let fail = true;
  globalThis.fetch = (async (_input, init) => {
    const count = (JSON.parse(String(init?.body)) as { events: unknown[] }).events.length;
    batches.push(count);
    if (fail) return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
    return new Response(JSON.stringify({ inserted: count, skipped: 0 }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(runSync(), /503|temporary/);
    let cfg = loadConfig();
    assert.equal(cfg.lastSync, undefined);
    assert.ok(cfg.syncHealth?.lastAttempt);
    assert.match(cfg.syncHealth?.lastError ?? "", /503|temporary/);
    fail = false;
    const result = await runSync();
    assert.deepEqual(batches, [500, 500, 1]);
    assert.equal(result.inserted, 501);
    cfg = loadConfig();
    assert.ok(cfg.lastSync);
    assert.ok(cfg.syncHealth?.lastSuccess);
    assert.equal(cfg.syncHealth?.lastError, undefined);
    assert.ok(readFileSync(join(root, ".burnlog", "config.json"), "utf8").includes("lastSuccess"));
  } finally {
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  }
});

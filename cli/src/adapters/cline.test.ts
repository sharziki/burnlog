import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ClineAdapter } from "./cline.js";

function withDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "bl-cline-"));
  process.env.BURNLOG_CLINE_DIR = dir;
  try {
    return fn(dir);
  } finally {
    delete process.env.BURNLOG_CLINE_DIR;
  }
}

test("cline: extension task log", () => {
  withDir((dir) => {
    mkdirSync(join(dir, "cline-task-1"));
    writeFileSync(
      join(dir, "cline-task-1", "ui_messages.json"),
      JSON.stringify([
        {
          type: "say",
          say: "api_req_started",
          ts: "2026-02-18T12:00:00Z",
          text: JSON.stringify({ cost: 0.05, tokensIn: 40, tokensOut: 15, cacheReads: 7, cacheWrites: 3, apiProtocol: "anthropic" }),
        },
      ]),
    );
    writeFileSync(join(dir, "cline-task-1", "api_conversation_history.json"), "<environment_details>\n<model>claude-sonnet-4</model>\n</environment_details>");
    const r = new ClineAdapter().scan();
    assert.equal(r.events.length, 1);
    const e = r.events[0];
    assert.equal(e.source, "cline");
    assert.equal(e.model, "claude-sonnet-4");
    assert.equal(e.provider, "anthropic");
    assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [40, 15, 7, 3]);
  });
});

test("cline: CLI messages — input includes cache, sticky model, zero rows dropped", () => {
  withDir((dir) => {
    const s = join(dir, "cline-cli-session");
    mkdirSync(s);
    writeFileSync(
      join(s, "cline-cli-session.json"),
      JSON.stringify({ session_id: "cline-cli-session", provider: "cline-pass", model: "cline-pass/glm-5.2", workspace_root: "/home/example/project" }),
    );
    writeFileSync(
      join(s, "cline-cli-session.messages.json"),
      JSON.stringify({
        sessionId: "cline-cli-session",
        messages: [
          { role: "user", ts: 1785320464923, content: [{ type: "text", text: "Inspect this project." }] },
          {
            id: "msg-1",
            role: "assistant",
            ts: 1785320475705,
            modelInfo: { id: "cline-free/glm-5.2", provider: "cline-pass" },
            metrics: { inputTokens: 7507, outputTokens: 131, cacheReadTokens: 50, cacheWriteTokens: 0, cost: 0.011 },
          },
          { role: "assistant", metrics: { inputTokens: 0, outputTokens: 0 } },
          { id: "msg-3", role: "assistant", metrics: { inputTokens: 12, outputTokens: 0, cacheReadTokens: 5, cacheWriteTokens: 2 } },
        ],
      }),
    );
    const r = new ClineAdapter().scan();
    const ev = r.events.sort((a, b) => a.inputTokens - b.inputTokens);
    assert.equal(ev.length, 2);
    assert.deepEqual([ev[0].inputTokens, ev[0].cacheReadTokens, ev[0].cacheCreationTokens], [5, 5, 2]);
    assert.equal(ev[0].model, "cline-free/glm-5.2");
    assert.equal(ev[1].inputTokens, 7457);
    assert.equal(ev[1].outputTokens, 131);
    assert.equal(ev[1].cacheReadTokens, 50);
    assert.equal(ev[1].timestamp, new Date(1785320475705).toISOString());
    for (const e of ev) assert.match(e.requestId, /^[0-9a-f]{32}$/);
  });
});

test("cline: re-scan yields identical ids", () => {
  withDir((dir) => {
    mkdirSync(join(dir, "t"));
    writeFileSync(
      join(dir, "t", "ui_messages.json"),
      JSON.stringify([
        { type: "say", say: "api_req_started", ts: 1, text: JSON.stringify({ tokensIn: 1 }) },
        { type: "say", say: "api_req_started", ts: 1, text: JSON.stringify({ tokensIn: 2 }) },
      ]),
    );
    const a = new ClineAdapter().scan().events.map((e) => e.requestId);
    const b = new ClineAdapter().scan().events.map((e) => e.requestId);
    assert.equal(new Set(a).size, 2);
    assert.deepEqual(a, b);
  });
});

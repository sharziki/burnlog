import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { totalTokens } from "./types.js";

test("Claude subagent transcripts count once with their cache creation tokens", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-claude-"));
  const previous = process.env.BURNLOG_CLAUDE_DIR;
  try {
    process.env.BURNLOG_CLAUDE_DIR = root;
    const nested = join(root, "project", "session", "subagents");
    mkdirSync(nested, { recursive: true });
    const record = JSON.stringify({
      type: "assistant", requestId: "req-nested", timestamp: "2026-10-02T00:00:00Z",
      message: { model: "claude-sonnet-4", usage: {
        input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 40,
      } },
    });
    writeFileSync(join(nested, "agent-a.jsonl"), record + "\n" + record + "\n");
    const result = new ClaudeCodeAdapter().scan();
    assert.equal(result.scannedFiles, 1);
    assert.equal(result.events.length, 1);
    assert.equal(totalTokens(result.events[0]), 125);
  } finally {
    if (previous === undefined) delete process.env.BURNLOG_CLAUDE_DIR;
    else process.env.BURNLOG_CLAUDE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrimeAgentAdapter } from "./prime-agent.js";

const msg = (id: string, ts: string, usage: object) =>
  JSON.stringify({ type: "message", id, timestamp: ts, message: { role: "assistant", provider: "anthropic", model: "claude-opus-5", usage } });

function setup(withChild: boolean) {
  const agent = mkdtempSync(join(tmpdir(), "bl-prime-"));
  mkdirSync(join(agent, "sessions"), { recursive: true });
  mkdirSync(join(agent, "session-artifacts", "root", "rlm"), { recursive: true });
  const parent = join(agent, "sessions", "root.jsonl");
  writeFileSync(
    parent,
    [
      JSON.stringify({ type: "session", id: "root" }),
      // Parent turn whose persisted usage is an aggregate including the child's 30/3.
      msg("p1", "2026-08-08T00:00:05Z", { input: 130, output: 13 }),
      JSON.stringify({
        type: "child_usage_attributed",
        id: "att1",
        targetId: "p1",
        timestamp: "2026-08-08T00:00:03.200Z",
        childUsage: { input: 30, output: 3 },
        aggregateUsage: { input: 130, output: 13 },
      }),
    ].join("\n"),
  );
  if (withChild) {
    writeFileSync(
      join(agent, "session-artifacts", "root", "rlm", "child.jsonl"),
      [
        JSON.stringify({ type: "session", id: "child", parentSession: parent, rlmDepth: 1 }),
        msg("c1", "2026-08-08T00:00:03Z", { input: 30, output: 3 }),
      ].join("\n"),
    );
  }
  // Index files are not transcripts.
  writeFileSync(join(agent, "session-artifacts", "root", "rlm-subagents.jsonl"), `{"type":"index"}\n`);
  process.env.BURNLOG_PRIME_AGENT_DIR = agent;
  return new PrimeAgentAdapter().scan();
}

test("prime-agent: a parsed child is subtracted from the parent's aggregate", () => {
  const r = setup(true);
  const totals = r.events.map((e) => [e.inputTokens, e.outputTokens]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(totals, [
    [30, 3],
    [100, 10],
  ]);
});

test("prime-agent: without the child transcript the aggregate stays whole", () => {
  const r = setup(false);
  assert.deepEqual(
    r.events.map((e) => [e.inputTokens, e.outputTokens]),
    [[130, 13]],
  );
});

test("prime-agent: an RLM child without a parent session is rejected", () => {
  const agent = mkdtempSync(join(tmpdir(), "bl-prime-bad-"));
  mkdirSync(join(agent, "sessions"), { recursive: true });
  writeFileSync(
    join(agent, "sessions", "orphan.jsonl"),
    [JSON.stringify({ type: "session", id: "c", rlmDepth: 1 }), msg("x", "2026-08-08T00:00:01Z", { input: 1, output: 1 })].join("\n"),
  );
  process.env.BURNLOG_PRIME_AGENT_DIR = agent;
  assert.equal(new PrimeAgentAdapter().scan().events.length, 0);
});

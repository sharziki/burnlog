import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SenpiAdapter } from "./senpi.js";

const V3 = [
  `{"type":"session","version":3,"id":"019fae75-f35c-7b20-8d6f-e6dea8f7d9f5","timestamp":"2026-07-29T15:19:53.436Z","cwd":"/tmp/workspace"}`,
  `{"type":"model_change","id":"a1","parentId":null,"timestamp":"2026-07-29T15:19:53.500Z","provider":"anthropic","modelId":"claude-opus-5"}`,
  `{"type":"session_info","id":"c3","parentId":"b2","timestamp":"2026-07-29T15:23:22.174Z","name":"Investigate Senpi text streaming rendering"}`,
  `{"type":"message","id":"b2","parentId":"a1","timestamp":"2026-07-29T15:20:01.000Z","message":{"role":"assistant","model":"claude-opus-5","provider":"anthropic","api":"anthropic-messages","responseId":"resp_1","stopReason":"stop","usage":{"input":2,"output":49,"cacheRead":40625,"cacheWrite":332,"totalTokens":41008,"cacheWrite1h":0,"reasoning":16,"cost":{"total":0.0236225}}}}`,
].join("\n");

test("senpi: v3 record with cost/reasoning fields (tokscale fixture)", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-senpi-"));
  mkdirSync(join(root, "--tmp-workspace--"));
  writeFileSync(join(root, "--tmp-workspace--", "s.jsonl"), V3);
  process.env.BURNLOG_SENPI_DIR = root;
  const r = new SenpiAdapter().scan();
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [2, 49, 40625, 332]);
  assert.equal(e.source, "senpi");
});

test("senpi: OmO task children are found from the cwd in session headers", () => {
  delete process.env.BURNLOG_SENPI_DIR;
  const agent = mkdtempSync(join(tmpdir(), "bl-senpi-agent-"));
  const project = mkdtempSync(join(tmpdir(), "bl-senpi-proj-"));
  mkdirSync(join(agent, "sessions", "enc"), { recursive: true });
  writeFileSync(
    join(agent, "sessions", "enc", "root.jsonl"),
    `{"type":"session","id":"root","cwd":${JSON.stringify(project)}}\n`,
  );
  mkdirSync(join(project, ".omo", "senpi-task", "children", "task1", "sessions"), { recursive: true });
  writeFileSync(join(project, ".omo", "senpi-task", "children", "task1", "sessions", "c.jsonl"), V3);
  process.env.SENPI_CODING_AGENT_DIR = agent;
  try {
    const r = new SenpiAdapter().scan();
    assert.equal(r.events.length, 1);
  } finally {
    delete process.env.SENPI_CODING_AGENT_DIR;
  }
});

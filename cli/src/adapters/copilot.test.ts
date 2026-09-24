import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bl-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const buckets = (e: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }) => [
  e.inputTokens,
  e.outputTokens,
  e.cacheReadTokens,
  e.cacheCreationTokens,
];

import { QwenAdapter } from "./qwen.js";
import { CopilotAdapter } from "./copilot.js";

const span = (o: object) => JSON.stringify(o);

test("copilot otel: chat span wins over inference log and invoke_agent summary for the same trace", () => {
  process.env.BURNLOG_COPILOT_DIR = tree({
    "otel/export.jsonl": [
      span({
        type: "span",
        traceId: "t1",
        spanId: "s-agent",
        name: "invoke_agent copilot",
        startTime: [1770000000, 0],
        endTime: [1770000010, 0],
        attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.usage.input_tokens": 5000, "gen_ai.usage.output_tokens": 500 },
      }),
      span({
        type: "span",
        traceId: "t1",
        spanId: "s-chat",
        parentSpanId: "s-agent",
        name: "chat claude-sonnet-4",
        startTime: [1770000001, 500000000],
        endTime: [1770000003, 0],
        attributes: {
          "gen_ai.operation.name": "chat",
          "gen_ai.response.model": "claude-sonnet-4",
          "gen_ai.conversation.id": "conv-1",
          "gen_ai.usage.input_tokens": 1200,
          "gen_ai.usage.cache_read.input_tokens": 1000,
          "gen_ai.usage.cache_write.input_tokens": 50,
          "gen_ai.usage.output_tokens": 80,
          "gen_ai.usage.reasoning.output_tokens": 20,
        },
      }),
      span({
        traceId: "t1",
        spanId: "log-1",
        body: "GenAI inference: done",
        attributes: { "event.name": "gen_ai.client.inference.operation.details", "gen_ai.usage.input_tokens": 1200, "gen_ai.usage.output_tokens": 80 },
      }),
      // A different trace with only an agent summary: used as the fallback.
      span({
        type: "span",
        traceId: "t2",
        spanId: "s2",
        name: "invoke_agent copilot",
        startTime: [1770000100, 0],
        attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.request.model": "gpt-5", "gen_ai.usage.input_tokens": 300, "gen_ai.usage.output_tokens": 30 },
      }),
    ].join("\n"),
  });
  const r = new CopilotAdapter().scan();
  assert.equal(r.events.length, 2);
  const chat = r.events.find((e) => e.model === "claude-sonnet-4")!;
  assert.deepEqual(buckets(chat), [200, 100, 1000, 50]);
  assert.equal(chat.timestamp, new Date(1770000001500).toISOString());
  const agent = r.events.find((e) => e.model === "gpt-5")!;
  assert.deepEqual(buckets(agent), [300, 30, 0, 0]);
  assert.equal(agent.provider, "openai");
});

test("copilot otel: not installed without an otel dir", () => {
  process.env.BURNLOG_COPILOT_DIR = tree({});
  assert.match(new CopilotAdapter().scan().note ?? "", /not installed/);
});

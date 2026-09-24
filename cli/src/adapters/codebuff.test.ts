import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CodebuffAdapter, chatIdToMs, chatContext, extractAssistantUsage } from "./codebuff.js";

function writeChat(base: string, project: string, chatId: string, body: unknown): string {
  const dir = join(base, "projects", project, "chats", chatId);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "chat-messages.json");
  writeFileSync(f, JSON.stringify(body));
  return f;
}

function scan(base: string) {
  process.env.BURNLOG_CODEBUFF_DIR = join(base, "projects");
  try {
    return new CodebuffAdapter().scan();
  } finally {
    delete process.env.BURNLOG_CODEBUFF_DIR;
  }
}

test("codebuff: helpers", () => {
  assert.equal(chatIdToMs("2025-12-14T10-00-00.000Z"), 1_765_706_400_000);
  assert.equal(chatIdToMs("not-a-chat-id"), undefined);
  assert.deepEqual(
    chatContext("/h/.config/manicode-dev/projects/sandbox/chats/2025-12-14T10-00-00.000Z/chat-messages.json"),
    { channel: "manicode-dev", project: "sandbox", chatId: "2025-12-14T10-00-00.000Z" },
  );
  const rs = extractAssistantUsage({
    role: "assistant",
    metadata: {
      runState: {
        sessionState: {
          mainAgentState: {
            messageHistory: [
              { role: "user", providerOptions: {} },
              { role: "assistant", providerOptions: { codebuff: { model: "openai/gpt-5", usage: { inputTokens: 2000, outputTokens: 800, cacheReadInputTokens: 400 } } } },
            ],
          },
        },
      },
    },
  });
  assert.deepEqual([rs.input, rs.output, rs.cacheRead, rs.model], [2000, 800, 400, "openai/gpt-5"]);
});

test("codebuff: one event per assistant message with usage (camel + snake shapes)", () => {
  const base = join(mkdtempSync(join(tmpdir(), "bl-cb-")), "manicode");
  writeChat(base, "my-project", "2025-12-20T12-00-00.000Z", [
    { variant: "user", content: "hello", timestamp: "2025-12-20T12:00:00.000Z" },
    {
      variant: "ai",
      timestamp: "2025-12-20T12:00:05.000Z",
      metadata: {
        model: "claude-sonnet-4-20250514",
        usage: { inputTokens: 500, outputTokens: 200, cacheCreationInputTokens: 300, cacheReadInputTokens: 100 },
      },
      credits: 1.25,
    },
    { variant: "user", content: "thanks", timestamp: "2025-12-20T12:00:10.000Z" },
    {
      variant: "ai",
      metadata: {
        model: "openai/gpt-5",
        codebuff: { usage: { prompt_tokens: 750, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 100 } } },
      },
    },
    { variant: "ai", timestamp: "2025-12-20T12:00:06.000Z", metadata: { model: "claude-sonnet-4-20250514" } },
  ]);
  const r = scan(base);
  const ev = r.events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  assert.equal(ev.length, 2);
  // second message has no timestamp → falls back to the chat id
  assert.equal(ev[0].timestamp, "2025-12-20T12:00:00.000Z");
  assert.equal(ev[0].model, "openai/gpt-5");
  assert.equal(ev[0].provider, "openai");
  assert.deepEqual([ev[0].inputTokens, ev[0].outputTokens, ev[0].cacheReadTokens], [750, 80, 100]);
  assert.equal(ev[1].model, "claude-sonnet-4-20250514");
  assert.equal(ev[1].provider, "anthropic");
  assert.deepEqual([ev[1].inputTokens, ev[1].outputTokens, ev[1].cacheCreationTokens, ev[1].cacheReadTokens], [500, 200, 300, 100]);
  for (const e of ev) {
    assert.match(e.requestId, /^[0-9a-f]{32}$/);
    assert.equal(e.source, "codebuff");
  }
});

test("codebuff: upstream message id makes a stable key", () => {
  const base = join(mkdtempSync(join(tmpdir(), "bl-cb-")), "manicode");
  const msg = { id: "m-1", variant: "ai", metadata: { model: "x", usage: { inputTokens: 1 } } };
  writeChat(base, "a", "2025-12-20T12-00-00.000Z", [msg]);
  writeChat(base, "b", "2025-12-21T12-00-00.000Z", [msg]);
  assert.equal(scan(base).events.length, 1);
});

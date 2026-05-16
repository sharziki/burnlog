import test from "node:test";
import assert from "node:assert/strict";
import { Burnlog } from "../src/index.js";

test("Burnlog.fromEnv uses burnlog.net defaults and trackResponse ingests Anthropic responses", async () => {
  const oldApiKey = process.env.BURNLOG_API_KEY;
  const oldSource = process.env.BURNLOG_SOURCE;
  const oldApiUrl = process.env.BURNLOG_API_URL;
  process.env.BURNLOG_API_KEY = "blg_test_key";
  process.env.BURNLOG_SOURCE = "hermes-agent";
  delete process.env.BURNLOG_API_URL;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const burnlog = Burnlog.fromEnv({
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, inserted: 1, skipped: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    flushIntervalMs: 0,
  });

  burnlog.trackResponse({
    id: "msg_123",
    model: "claude-sonnet-4-5",
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 5,
    },
  });

  await burnlog.close();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://burnlog.net/api/ingest");
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer blg_test_key");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.events[0].source, "hermes-agent");
  assert.equal(body.events[0].provider, "anthropic");

  process.env.BURNLOG_API_KEY = oldApiKey;
  process.env.BURNLOG_SOURCE = oldSource;
  process.env.BURNLOG_API_URL = oldApiUrl;
});

test("Burnlog.trackResponse maps OpenAI-style responses", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const burnlog = new Burnlog({
    apiKey: "blg_test_key",
    source: "codex-agent",
    baseUrl: "https://burnlog.net",
    flushIntervalMs: 0,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, inserted: 1, skipped: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  burnlog.trackResponse({
    id: "resp_123",
    model: "gpt-5",
    usage: {
      prompt_tokens: 90,
      completion_tokens: 25,
      input_tokens_details: { cached_tokens: 7 },
    },
  });

  await burnlog.close();

  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.events[0].provider, "openai");
  assert.equal(body.events[0].inputTokens, 90);
  assert.equal(body.events[0].outputTokens, 25);
  assert.equal(body.events[0].cacheReadTokens, 7);
});

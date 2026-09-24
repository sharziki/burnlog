import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JcodeAdapter } from "./jcode.js";
import type { BurnEvent } from "./types.js";

function home(): string {
  const h = mkdtempSync(join(tmpdir(), "bl-jcode-"));
  mkdirSync(join(h, "sessions"));
  return h;
}

function put(h: string, name: string, body: string | object): void {
  writeFileSync(join(h, "sessions", name), typeof body === "string" ? body : JSON.stringify(body));
}

function scan(h: string): BurnEvent[] {
  process.env.BURNLOG_JCODE_DIR = h;
  try {
    return new JcodeAdapter().scan().events;
  } finally {
    delete process.env.BURNLOG_JCODE_DIR;
  }
}

const b = (e: BurnEvent) => [e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens];

test("jcode: not installed", () => {
  process.env.BURNLOG_JCODE_DIR = join(tmpdir(), "bl-jcode-missing");
  const r = new JcodeAdapter().scan();
  delete process.env.BURNLOG_JCODE_DIR;
  assert.equal(r.note, "not installed");
});

test("jcode: anthropic-shaped usage keeps split cache; reasoning added to output; back-anchored ts", () => {
  const h = home();
  put(h, "session_test.json", {
    id: "session_test",
    provider_key: "cliproxyapi",
    model: "claude-sonnet-4",
    working_dir: "/Users/alice/project",
    messages: [
      { id: "user_1", role: "user", timestamp: "2026-06-16T12:00:00Z", content: [] },
      {
        id: "assistant_1",
        role: "assistant",
        timestamp: "2026-06-16T12:00:01Z",
        token_usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 800, cache_creation_input_tokens: 50, reasoning_output_tokens: 25 },
        tool_duration_ms: 1234,
      },
    ],
  });
  put(h, "not-a-session.json", { messages: [{ id: "x", token_usage: { input_tokens: 5 } }] });
  const ev = scan(h);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].model, "claude-sonnet-4");
  assert.equal(ev[0].provider, "anthropic");
  assert.deepEqual(b(ev[0]), [1200, 325, 800, 50]);
  assert.equal(ev[0].timestamp, new Date(Date.parse("2026-06-16T12:00:01Z") - 1234).toISOString());
  assert.match(ev[0].requestId, /^[0-9a-f]{32}$/);
});

test("jcode: openai-shaped usage subtracts cached subset; cache > input keeps split", () => {
  const h = home();
  put(h, "session_openai.json", {
    id: "s1",
    model: "gpt-5.6-sol",
    messages: [{ id: "m1", role: "assistant", timestamp: "2026-06-16T12:00:01Z", token_usage: { input_tokens: 19347, output_tokens: 71, cache_read_input_tokens: 15872 } }],
  });
  put(h, "session_openrouter.json", {
    id: "s2",
    model: "anthropic/claude-sonnet-4",
    messages: [{ id: "m2", role: "assistant", timestamp: "2026-06-16T12:00:02Z", token_usage: { input_tokens: 1000, output_tokens: 71, cache_read_input_tokens: 800 } }],
  });
  put(h, "session_anthropic.json", {
    id: "s3",
    model: "claude-sonnet-4-5",
    messages: [{ id: "m3", role: "assistant", timestamp: "2026-06-16T12:00:03Z", token_usage: { input_tokens: 20000, output_tokens: 71, cache_read_input_tokens: 15872, cache_creation_input_tokens: 0 } }],
  });
  put(h, "session_bigcache.json", {
    id: "s4",
    model: "gpt-5.6-sol",
    messages: [{ id: "m4", role: "assistant", timestamp: "2026-06-16T12:00:04Z", token_usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 500 } }],
  });
  const ev = scan(h).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  assert.deepEqual(ev.map(b), [
    [3475, 71, 15872, 0],
    [200, 71, 800, 0],
    [20000, 71, 15872, 0],
    [100, 1, 500, 0],
  ]);
});

test("jcode: journal appends new messages with meta model; journal repeats replace snapshot", () => {
  const h = home();
  put(h, "session_test.json", {
    id: "session_test",
    model: "snapshot-model",
    messages: [
      { id: "assistant_snapshot", role: "assistant", timestamp: "2026-06-16T12:00:01Z", token_usage: { input_tokens: 100, output_tokens: 10 } },
      { id: "assistant_live", role: "assistant", timestamp: "2026-06-16T12:00:02Z", token_usage: { input_tokens: 100, output_tokens: 10 } },
    ],
  });
  put(
    h,
    "session_test.journal.jsonl",
    [
      `{"append_messages":[{"id":"assistant_live","role":"assistant","timestamp":"2026-06-16T12:00:05Z","token_usage":{"input_tokens":900,"output_tokens":300,"cache_read_input_tokens":40}}]}`,
      `garbage`,
      `{"meta":{"provider_key":"openai","model":"journal-model"},"append_messages":[{"id":"assistant_journal","role":"assistant","timestamp":"2026-06-16T12:00:06Z","token_usage":{"input_tokens":200,"output_tokens":20,"cache_read_input_tokens":50}}, {"id":"bad","role":"assistant","token_usage":"oops"}]}`,
    ].join("\n"),
  );
  const ev = scan(h).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  assert.equal(ev.length, 3);
  assert.deepEqual(
    ev.map((e) => [e.model, ...b(e)]),
    [
      ["snapshot-model", 100, 10, 0, 0],
      ["snapshot-model", 860, 300, 40, 0],
      ["journal-model", 150, 20, 50, 0],
    ],
  );
});

test("jcode: timezone-less timestamps are UTC; missing usage and zero usage skipped", () => {
  const h = home();
  put(h, "session_tz.json", {
    id: "tz",
    model: "m",
    messages: [
      { id: "a", role: "assistant", timestamp: "2026-06-16T12:00:00", token_usage: { input_tokens: 1, output_tokens: 1 } },
      { id: "b", role: "assistant", timestamp: "2026-06-16T12:00:00Z" },
      { id: "c", role: "assistant", timestamp: "2026-06-16T12:00:00Z", token_usage: { input_tokens: 0, output_tokens: 0 } },
    ],
  });
  const ev = scan(h);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].timestamp, "2026-06-16T12:00:00.000Z");
});

test("jcode: a forked session's copied messages count once", () => {
  const h = home();
  const msg = { id: "message_1_abc", role: "assistant", timestamp: "2026-06-16T12:00:00Z", token_usage: { input_tokens: 10, output_tokens: 1 } };
  put(h, "session_otter_1.json", { id: "otter", model: "m", messages: [msg] });
  put(h, "session_sheep_2.json", { id: "sheep", model: "m", messages: [msg, { ...msg, id: "message_2_def" }] });
  assert.equal(scan(h).length, 2);
});

test("jcode: since skips old sessions", () => {
  const h = home();
  put(h, "session_x.json", { id: "x", model: "m", messages: [{ id: "a", token_usage: { input_tokens: 1 } }] });
  process.env.BURNLOG_JCODE_DIR = h;
  const r = new JcodeAdapter().scan({ since: new Date(Date.now() + 3600_000) });
  delete process.env.BURNLOG_JCODE_DIR;
  assert.equal(r.events.length, 0);
});

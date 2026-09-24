import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AmpAdapter } from "./amp.js";

const ms = (iso: string) => Date.parse(iso);

function scanThreads(threads: Record<string, unknown>, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bl-amp-"));
  for (const [name, body] of Object.entries(threads)) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  process.env.BURNLOG_AMP_DIR = dir;
  try {
    return { dir, result: new AmpAdapter().scan(opts) };
  } finally {
    delete process.env.BURNLOG_AMP_DIR;
  }
}

const byTime = <T extends { timestamp: string }>(e: T[]) =>
  [...e].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

test("amp: partial ledger reconciled with message usage", () => {
  const created = ms("2026-04-04T12:00:00Z");
  const { result } = scanThreads({
    "T-partial.json": {
      id: "T-partial",
      created,
      usageLedger: {
        events: [
          { timestamp: "2026-04-08T12:00:00Z", model: "claude-sonnet-4-0", credits: 0.75, tokens: { input: 100, output: 20 } },
        ],
      },
      messages: [
        { role: "assistant", messageId: 1, usage: { model: "claude-sonnet-4-0", inputTokens: 100, outputTokens: 20 } },
        { role: "assistant", messageId: 2, usage: { model: "claude-sonnet-4-0", inputTokens: 50, outputTokens: 10 } },
      ],
    },
  });
  const ev = byTime(result.events);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].timestamp, new Date(created + 2000).toISOString());
  assert.equal(ev[0].inputTokens, 50);
  assert.equal(ev[1].timestamp, "2026-04-08T12:00:00.000Z");
  assert.equal(ev[1].inputTokens, 100);
  assert.equal(ev[1].provider, "anthropic");
  assert.equal(ev[1].source, "amp");
});

test("amp: full ledger is not double counted", () => {
  const { result } = scanThreads({
    "T-full.json": {
      id: "T-full",
      created: ms("2026-04-04T12:00:00Z"),
      usageLedger: {
        events: [
          { timestamp: "2026-04-04T12:00:00Z", model: "claude-sonnet-4-0", tokens: { input: 20, output: 5 } },
          { timestamp: "2026-04-05T12:00:00Z", model: "claude-sonnet-4-0", tokens: { input: 25, output: 5 } },
        ],
      },
      messages: [
        { role: "assistant", messageId: 1, usage: { model: "claude-sonnet-4-0", inputTokens: 20, outputTokens: 5 } },
        { role: "assistant", messageId: 2, usage: { model: "claude-sonnet-4-0", inputTokens: 25, outputTokens: 5 } },
      ],
    },
  });
  const ev = byTime(result.events);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].timestamp, "2026-04-04T12:00:00.000Z");
  assert.equal(ev[1].timestamp, "2026-04-05T12:00:00.000Z");
  assert.equal(ev.reduce((s, e) => s + e.inputTokens, 0), 45);
});

test("amp: toMessageId match beats the token heuristic", () => {
  const { result } = scanThreads({
    "T-mid.json": {
      id: "T-mid",
      created: ms("2026-04-04T12:00:00Z"),
      usageLedger: {
        events: [
          { timestamp: "2026-04-10T12:00:00Z", model: "claude-sonnet-4-0", tokens: { input: 20, output: 5 }, toMessageId: 2 },
          { timestamp: "2026-04-05T12:00:00Z", model: "claude-sonnet-4-0", tokens: { input: 20, output: 5 }, toMessageId: 1 },
        ],
      },
      messages: [
        { role: "assistant", messageId: 1, usage: { model: "claude-sonnet-4-0", inputTokens: 20, outputTokens: 5 } },
        { role: "assistant", messageId: 2, usage: { model: "claude-sonnet-4-0", inputTokens: 20, outputTokens: 5 } },
      ],
    },
  });
  const ev = byTime(result.events);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].timestamp, "2026-04-05T12:00:00.000Z");
  assert.equal(ev[1].timestamp, "2026-04-10T12:00:00.000Z");
});

test("amp: missing ledger timestamp takes the message's", () => {
  const created = ms("2026-04-04T12:00:00Z");
  const { result } = scanThreads({
    "T-nots.json": {
      id: "T-nots",
      created,
      usageLedger: { events: [{ model: "claude-sonnet-4-0", tokens: { input: 20, output: 5 } }] },
      messages: [{ role: "assistant", messageId: 7, usage: { model: "claude-sonnet-4-0", inputTokens: 20, outputTokens: 5 } }],
    },
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].timestamp, new Date(created + 7000).toISOString());
});

test("amp: no created falls back to file mtime; cache buckets kept; ids opaque", () => {
  const { result } = scanThreads({
    "T-nocreated.json": {
      id: "T-nocreated",
      messages: [
        {
          role: "assistant",
          messageId: 5,
          usage: { model: "claude-sonnet-4-0", inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 300, cacheCreationInputTokens: 40 },
        },
        { role: "user", messageId: 6 },
      ],
    },
    "notathread.json": { id: "x" },
    "T-bad.json": "{nope",
  });
  assert.equal(result.events.length, 1);
  const e = result.events[0];
  assert.ok(Date.parse(e.timestamp) > ms("2020-01-01T00:00:00Z"));
  assert.equal(e.cacheReadTokens, 300);
  assert.equal(e.cacheCreationTokens, 40);
  assert.match(e.requestId, /^[0-9a-f]{32}$/);
});

test("amp: honours since via file mtime", () => {
  const { dir } = scanThreads({});
  writeFileSync(
    join(dir, "T-old.json"),
    JSON.stringify({ id: "T-old", created: 1, messages: [{ role: "assistant", messageId: 1, usage: { model: "m", inputTokens: 1 } }] }),
  );
  const old = new Date("2020-01-01T00:00:00Z");
  utimesSync(join(dir, "T-old.json"), old, old);
  process.env.BURNLOG_AMP_DIR = dir;
  try {
    assert.equal(new AmpAdapter().scan({ since: new Date() }).events.length, 0);
    assert.equal(new AmpAdapter().scan().events.length, 1);
  } finally {
    delete process.env.BURNLOG_AMP_DIR;
  }
});

test("amp: not installed", () => {
  process.env.BURNLOG_AMP_DIR = join(tmpdir(), "bl-amp-does-not-exist-xyz");
  try {
    const a = new AmpAdapter();
    assert.equal(a.detect(), false);
    assert.equal(a.scan().note, "not installed");
  } finally {
    delete process.env.BURNLOG_AMP_DIR;
  }
});

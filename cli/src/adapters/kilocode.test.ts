import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { KilocodeAdapter } from "./kilocode.js";

test("kilocode: parses api_req_started with history model; since skips old files", () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-kilo-"));
  const task = join(dir, "kilo-task-1");
  mkdirSync(task);
  writeFileSync(
    join(task, "ui_messages.json"),
    JSON.stringify([
      {
        type: "say",
        say: "api_req_started",
        ts: "2026-02-18T12:00:00Z",
        text: JSON.stringify({ cost: 0.05, tokensIn: 40, tokensOut: 15, cacheReads: 7, cacheWrites: 3, apiProtocol: "azure/openai" }),
      },
      { type: "say", say: "assistant_message", ts: "2026-02-18T12:00:01Z", text: JSON.stringify({ tokensIn: 10 }) },
    ]),
  );
  writeFileSync(join(task, "api_conversation_history.json"), "<environment_details>\n<model>gpt-5</model>\n<name>KiloAgent</name>\n</environment_details>");

  process.env.BURNLOG_KILOCODE_DIR = dir;
  try {
    const r = new KilocodeAdapter().scan();
    assert.equal(r.events.length, 1);
    const e = r.events[0];
    assert.equal(e.source, "kilocode");
    assert.equal(e.model, "gpt-5");
    assert.equal(e.provider, "openai");
    assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [40, 15, 7, 3]);

    const old = new Date("2020-01-01T00:00:00Z");
    utimesSync(join(task, "ui_messages.json"), old, old);
    assert.equal(new KilocodeAdapter().scan({ since: new Date() }).events.length, 0);
  } finally {
    delete process.env.BURNLOG_KILOCODE_DIR;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { KimchiAdapter } from "./kimchi.js";

const HEADER = `{"type":"session","id":"kimchi_ses_001","timestamp":"2026-08-01T00:00:00.000Z","cwd":"/tmp/kimchi-project"}`;
const MSG = `{"type":"message","id":"msg_001","timestamp":"2026-08-01T00:00:01.000Z","message":{"role":"assistant","model":"kimi-k2.6","provider":"kimchi-dev","usage":{"input":9441,"output":131,"cacheRead":50,"cacheWrite":0,"totalTokens":9622}}}`;

test("kimchi: Pi-format session (tokscale fixture); session-scoped dedupe", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-kimchi-"));
  mkdirSync(join(root, "proj"));
  writeFileSync(join(root, "proj", "a.jsonl"), `${HEADER}\n${MSG}\n`);
  // The same entry id in a different session is a different message for Kimchi.
  writeFileSync(join(root, "proj", "b.jsonl"), `${HEADER.replace("kimchi_ses_001", "kimchi_ses_002")}\n${MSG}\n`);
  process.env.BURNLOG_KIMCHI_DIR = root;
  const r = new KimchiAdapter().scan();
  assert.equal(r.events.length, 2);
  const e = r.events[0];
  assert.equal(e.source, "kimchi");
  assert.equal(e.model, "kimi-k2.6");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheCreationTokens], [9441, 131, 50, 0]);
});

test("kimchi: KIMCHI_CODING_AGENT_DIR/sessions is the default root", () => {
  delete process.env.BURNLOG_KIMCHI_DIR;
  const agent = mkdtempSync(join(tmpdir(), "bl-kimchi-agent-"));
  mkdirSync(join(agent, "sessions", "p"), { recursive: true });
  writeFileSync(join(agent, "sessions", "p", "a.jsonl"), `${HEADER}\n${MSG}\n`);
  process.env.KIMCHI_CODING_AGENT_DIR = agent;
  try {
    assert.equal(new KimchiAdapter().scan().events.length, 1);
  } finally {
    delete process.env.KIMCHI_CODING_AGENT_DIR;
  }
});

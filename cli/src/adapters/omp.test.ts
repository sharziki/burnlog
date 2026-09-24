import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { OmpAdapter } from "./omp.js";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "bl-omp-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

test("omp: top-level session and nested subagent file both parse (tokscale fixtures)", () => {
  process.env.BURNLOG_OMP_DIR = tree({
    "--tmp-workspace--/2026-08-20_01a0.jsonl": [
      `{"type":"session","version":3,"id":"01a01fc8-e982-7000-b3c1-4cca8048e34a","timestamp":"2026-08-20T15:27:35.811Z","cwd":"/tmp/workspace"}`,
      `{"type":"message","id":"b2","parentId":null,"timestamp":"2026-08-20T15:27:40.000Z","message":{"role":"assistant","model":"z-ai/glm-5.2:free","provider":"openrouter-glm-free-zdr","usage":{"input":17,"output":10,"cacheRead":0,"cacheWrite":0,"totalTokens":27}}}`,
    ].join("\n"),
    "--tmp-workspace--/2026-08-20_01a0/TelegramBrokerMap.jsonl": [
      `{"type":"session","version":3,"id":"01a00742-c3eb-7000-92ab-e3294db5e528-TelegramBrokerMap","timestamp":"2026-08-15T21:10:11.179Z","cwd":"/tmp/proj"}`,
      `{"type":"message","id":"s1","parentId":null,"timestamp":"2026-08-15T21:10:20.000Z","message":{"role":"assistant","model":"claude-opus-5","provider":"anthropic","usage":{"input":12,"output":34,"cacheRead":0,"cacheWrite":0,"totalTokens":46}}}`,
    ].join("\n"),
  });
  const r = new OmpAdapter().scan();
  assert.equal(r.events.length, 2);
  const byModel = Object.fromEntries(r.events.map((e) => [e.model, e]));
  assert.equal(byModel["z-ai/glm-5.2:free"].inputTokens, 17);
  assert.equal(byModel["z-ai/glm-5.2:free"].provider, "other");
  assert.equal(byModel["claude-opus-5"].outputTokens, 34);
  assert.equal(byModel["claude-opus-5"].provider, "anthropic");
  assert.ok(r.events.every((e) => e.source === "omp"));
});

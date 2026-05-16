import test from "node:test";
import assert from "node:assert/strict";
import { generateAgentPrompt } from "../src/prompt.js";

test("generateAgentPrompt builds a hermes prompt with env-based SDK instructions", () => {
  const prompt = generateAgentPrompt({
    agent: "hermes",
    apiKey: "blg_live_key",
    source: "burnlog-pm",
    includeMcp: true,
    apiUrl: "https://burnlog.net",
  });

  assert.match(prompt, /Burnlog\.fromEnv\(\)/);
  assert.match(prompt, /BURNLOG_API_KEY=blg_live_key/);
  assert.match(prompt, /BURNLOG_SOURCE=burnlog-pm/);
  assert.match(prompt, /@sxna\/burnlog-mcp/);
  assert.match(prompt, /Do not install burnlog CLI hooks for Hermes/);
});

test("generateAgentPrompt builds a Claude prompt with login and install steps", () => {
  const prompt = generateAgentPrompt({
    agent: "claude",
    apiKey: "blg_live_key",
    apiUrl: "https://burnlog.net",
  });

  assert.match(prompt, /npm install -g @sxnalabs\/burnlog/);
  assert.match(prompt, /burnlog login blg_live_key/);
  assert.match(prompt, /burnlog install/);
  assert.match(prompt, /burnlog sync/);
});

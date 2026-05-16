import pc from "picocolors";
import { loadConfig } from "./config.js";

export type PromptAgent = "claude" | "codex" | "hermes" | "custom";

type PromptOptions = {
  agent: PromptAgent;
  apiKey?: string;
  apiUrl: string;
  source?: string;
  includeMcp?: boolean;
};

function usage(): never {
  console.error(pc.red("usage: burnlog prompt <claude|codex|hermes|custom> [--api-key <key>] [--source <id>] [--with-mcp]"));
  process.exit(1);
}

function parseArgs(args: string[]): PromptOptions {
  const cfg = loadConfig();
  const [agentRaw, ...rest] = args;
  if (!agentRaw) usage();
  if (!["claude", "codex", "hermes", "custom"].includes(agentRaw)) usage();

  let apiKey = cfg.apiKey;
  let source: string | undefined;
  let includeMcp = false;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--api-key") {
      apiKey = rest[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--source") {
      source = rest[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--with-mcp") {
      includeMcp = true;
      continue;
    }
    usage();
  }

  return {
    agent: agentRaw as PromptAgent,
    apiKey,
    apiUrl: cfg.apiUrl,
    source,
    includeMcp,
  };
}

function apiKeyValue(apiKey?: string): string {
  return apiKey && apiKey.trim() ? apiKey.trim() : "blg_PASTE_YOUR_KEY_HERE";
}

function sourceValue(source?: string): string {
  return source && source.trim() ? source.trim() : "my-agent";
}

function mcpSnippet(apiKey: string): string {
  return `
If this agent supports MCP config, add this too:

{
  "mcpServers": {
    "burnlog": {
      "command": "npx",
      "args": ["-y", "@sxna/burnlog-mcp"],
      "env": { "BURNLOG_API_KEY": "${apiKey}" }
    }
  }
}`;
}

export function generateAgentPrompt(opts: PromptOptions): string {
  const key = apiKeyValue(opts.apiKey);
  const source = sourceValue(opts.source);

  if (opts.agent === "claude") {
    return `Install burnlog on this machine and do not modify anything unrelated.

Run these commands in order:
1. npm install -g @sxnalabs/burnlog
2. burnlog login ${key}
3. burnlog install
4. burnlog sync
5. burnlog status

Success criteria:
- burnlog status shows api key present
- Claude hook shows installed
- The sync command completes without errors`;
  }

  if (opts.agent === "codex") {
    return `Install burnlog on this machine and do not modify anything unrelated.

Run these commands in order:
1. npm install -g @sxnalabs/burnlog
2. burnlog login ${key}
3. burnlog sync
4. burnlog status

Then report whether ~/.codex/sessions was detected.
If Codex logs are present, explain that future syncs can be done with burnlog sync or burnlog daemon.`;
  }

  const base = `Wire burnlog into this agent codebase using the SDK, not local log scraping.

Requirements:
1. Install the SDK: npm install @sxna/burnlog-sdk
2. Persist these env vars in the runtime that makes model calls:
   - BURNLOG_API_KEY=${key}
   - BURNLOG_SOURCE=${source}
   - BURNLOG_API_URL=${opts.apiUrl}
3. Import Burnlog from @sxna/burnlog-sdk.
4. Create a singleton tracker with:
   const burnlog = Burnlog.fromEnv();
5. Find the exact code path where provider responses come back from Anthropic/OpenAI or any compatible OpenAI-style SDK.
6. Immediately after each successful model response, call:
   burnlog.trackResponse(response);
7. If a provider response is custom and trackResponse cannot infer it, call burnlog.track({...}) manually with requestId, model, inputTokens, outputTokens, optional cache tokens, and timestamp.
8. Keep the integration minimal: no refactors, no behavior changes outside burnlog instrumentation.
9. Run the project's existing tests/build after the patch.
10. In your final report, list every file changed and quote the exact burnlog lines added.

Important constraints:
- Do not install burnlog CLI hooks for Hermes/custom agents.
- Do not log prompts, responses, file paths, or code into burnlog.
- If the codebase has multiple provider call sites, instrument all of them.
- If the runtime has a shutdown hook, flush gracefully with await burnlog.close() on shutdown when practical.`;

  return opts.includeMcp ? `${base}${mcpSnippet(key)}` : base;
}

export function prompt(args: string[]): void {
  const parsed = parseArgs(args);
  console.log(generateAgentPrompt(parsed));
}

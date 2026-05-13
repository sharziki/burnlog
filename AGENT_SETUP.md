# burnlog — Agent Setup Prompt

Copy-paste one of the prompts below into your AI coding agent. They install
burnlog and validate your API key. Claude Code can also be wired for automatic
sync. You'll need an API key first — sign in at https://burnlog.net and create
one from Settings.

---

## For Claude Code

Paste this as a single message:

```text
Install burnlog to track my token usage. Here's my API key: blg_PASTE_YOUR_KEY_HERE

Run these commands:
1. npm install -g @sxnalabs/burnlog
2. burnlog login blg_PASTE_YOUR_KEY_HERE
3. burnlog install
4. burnlog sync

That's it. Don't change anything else.
```

After this, burnlog auto-syncs whenever a Claude Code session ends.

---

## For Codex

Codex session logs are picked up by `burnlog scan`, `burnlog sync`, and
`burnlog daemon`, but burnlog does **not** currently install a Codex-specific
hook. Use this prompt instead:

```text
Run these commands in order:
1. npm install -g @sxnalabs/burnlog
2. burnlog login blg_PASTE_YOUR_KEY_HERE
3. burnlog sync
```

If you also use Claude Code on the same machine, you can optionally run
`burnlog install` to let Claude's session-end hook trigger future syncs.

---

## For Hermes

burnlog does not yet support passive parsing of Hermes usage logs. Today the
working path is explicit tracking via the SDK (or another direct integration)
inside the runtime that makes the model calls.

If you want a copy-paste prompt for a Hermes-powered workflow, use this:

```text
Set up burnlog tracking for this Hermes workflow using the SDK, not local log parsing.

1. Install the package: npm install @sxna/burnlog-sdk
2. Set BURNLOG_API_KEY=blg_PASTE_YOUR_KEY_HERE in the runtime environment.
3. Wrap the model-call path so burnlog records usage after each provider response.
4. Use burnlog.trackAnthropic(...) or burnlog.trackOpenAI(...) when possible.
5. If the provider response shape is custom, call burnlog.track({...}) manually.

Do not attempt to install burnlog CLI hooks for Hermes. Hermes local log ingestion is not supported yet.
```

If your Hermes agent should read back leaderboard context inside the runtime,
add the MCP server section below too.

---

## For openclaw

burnlog does not yet support parsing openclaw token usage logs. If your agent
can call an SDK directly, use the SDK section below instead.

---

## For custom agents (SDK)

If you're building your own agent, install the SDK instead:

```bash
npm install @sxna/burnlog-sdk
```

Then add this to your agent code:

```ts
import { Burnlog } from "@sxna/burnlog-sdk";

const burnlog = new Burnlog({
  apiKey: process.env.BURNLOG_API_KEY!,
  source: "my-agent",
});

// After any Anthropic API call:
burnlog.trackAnthropic(response);

// After any OpenAI API call:
burnlog.trackOpenAI(response);

// Or track manually:
burnlog.track({
  requestId: response.id,
  model: response.model,
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
});
```

---

## MCP Server (query your rank from inside an agent)

Add to `~/.claude.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "burnlog": {
      "command": "npx",
      "args": ["-y", "@sxna/burnlog-mcp"],
      "env": { "BURNLOG_API_KEY": "blg_PASTE_YOUR_KEY_HERE" }
    }
  }
}
```

Then ask your agent "what's my rank" or "show the leaderboard".

---

## What gets sent

Only token counts, model name, provider, timestamp, and a random dedup ID.
Never prompts, code, file paths, or project names.

## Self-hosting

```bash
git clone https://github.com/sharziki/burnlog
cd burnlog && cp web/.env.example web/.env
# fill in AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
docker compose up -d
```

Point any client at your instance: `BURNLOG_API_URL=https://burn.mycompany.com burnlog sync`

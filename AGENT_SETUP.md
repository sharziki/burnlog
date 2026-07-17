# burnlog — Agent Setup Prompt

Copy-paste one of the prompts below into your AI coding agent. It installs burnlog
and wires up auto-sync. **No API key to copy** — `burnlog login` signs you in with
GitHub in the browser.

> Prefer it fully automatic? Drop [`AGENTS.md`](./AGENTS.md) into your repo (or
> global agent config) and your agent self-enrolls.

---

## For Claude Code / Cursor / Cowork

Paste this as a single message:

```
Set up burnlog to track my AI token usage. Run these commands:

1. npm install -g @sxnalabs/burnlog
2. burnlog login          # opens the browser — I'll sign in with GitHub
3. burnlog install        # auto-sync when a session ends
4. burnlog sync           # backfill my history

Then add the burnlog MCP to my config (no key needed after login):
  { "mcpServers": { "burnlog": { "command": "npx", "args": ["-y", "@sxna/burnlog-mcp"] } } }

Don't change anything else.
```

After this, burnlog auto-syncs every time a session ends, and you can ask your
agent "what's my rank" or "who's top of the leaderboard".

---

## For Codex

Same flow — Codex sessions at `~/.codex/sessions/` are picked up automatically:

```
1. npm install -g @sxnalabs/burnlog
2. burnlog login
3. burnlog install
4. burnlog sync
```

---

## For CI / non-interactive machines

No browser? Use a key from <https://burnlog.net/settings> instead of the login flow:

```bash
npm install -g @sxnalabs/burnlog
burnlog login blg_PASTE_YOUR_KEY_HERE   # explicit key path, no browser
burnlog sync
```

Or pass it per-command: `BURNLOG_API_KEY=blg_... burnlog sync`.

---

## For custom agents (SDK)

If you're building your own agent, install the SDK instead:

```
npm install @sxna/burnlog-sdk
```

```ts
import { Burnlog } from "@sxna/burnlog-sdk";

const burnlog = new Burnlog({
  apiKey: process.env.BURNLOG_API_KEY!,
  source: "my-agent",
});

burnlog.trackAnthropic(response); // after an Anthropic call
burnlog.trackOpenAI(response);    // after an OpenAI call
burnlog.track({                   // or manually
  requestId: response.id,
  model: response.model,
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
});
```

---

## MCP server (query your rank + join orgs from inside an agent)

After `burnlog login`, the MCP reads your credentials automatically. Add to
`~/.claude.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "burnlog": {
      "command": "npx",
      "args": ["-y", "@sxna/burnlog-mcp"]
    }
  }
}
```

Tools: `get_my_rank`, `get_my_stats`, `get_my_clubs`, `get_leaderboard`,
`find_user`, `list_orgs`, `join_org`. Ask "what's my rank", "show the leaderboard",
or "join the sxna-labs org".

For CI or a shared machine you can still pin an explicit key:
`"env": { "BURNLOG_API_KEY": "blg_..." }`.

---

## What gets sent

Only token counts, model name, provider, timestamp, and a random dedup ID. Never
prompts, code, file paths, or project names.

## Self-hosting

```bash
git clone https://github.com/sharziki/burnlog
cd burnlog && cp web/.env.example web/.env
# fill in AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
docker compose up -d
```

Point any client at your instance: `BURNLOG_API_URL=https://burn.mycompany.com burnlog sync`

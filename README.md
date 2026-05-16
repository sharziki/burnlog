# burnlog

> Private leaderboard for AI token burn. A [SXNA Labs](https://github.com/sharziki) product.

```
┌──────────────┐                                          ┌───────────┐
│  burnlog CLI │──┐                                       │           │
│  (log reader)│  │                                       │           │
└──────────────┘  │                                       │           │
                  │                                       │           │
┌──────────────┐  │    POST /api/ingest (bearer key)      │  web API  │
│ @sxna/       │  ├──────────────────────────────────────▶│  (Next.js)│
│ burnlog-sdk  │  │                                       │           │
│ (in-agent)   │  │                                       │           │
└──────────────┘  │                                       │           │
                  │                                       │           │
┌──────────────┐  │                                       │           │
│ @sxna/       │  │    GET /api/me/*  (bearer key)        │           │
│ burnlog-mcp  │──┘◀──────────────────────────────────────│           │
│ (readback)   │                                          └─────┬─────┘
└──────────────┘                                                │
                                                                ▼
                                                          ┌───────────┐
                                                          │ Postgres  │
                                                          └───────────┘
```

## What it is

burnlog tracks every token you push through AI coding agents (Claude Code,
Codex, custom agents, …) across all your projects, and ranks you against
anyone else plugged in. Tokens only — **never prompts, filenames, or working
directories**. See [privacy model](web/src/app/privacy/page.tsx) for exactly
what we do and don't store.

## Three ways to plug in

Pick the one that matches how your tokens are produced.

| You have…                           | Use              | Package                 |
| ----------------------------------- | ---------------- | ----------------------- |
| Claude Code, Codex, or similar CLI  | **CLI**          | `@sxnalabs/burnlog`     |
| Your own agent calling an LLM SDK   | **SDK**          | `@sxna/burnlog-sdk`     |
| Claude Code / Cursor and want to ask it about your rank | **MCP server** | `@sxna/burnlog-mcp` |

### CLI — for agents that write logs to disk

```bash
npm install -g @sxnalabs/burnlog
burnlog login <api-key>      # grab one at https://burnlog.net/settings
burnlog install              # Claude Code only: auto-sync on session end
burnlog prompt hermes --source my-agent --with-mcp
```

Today, `burnlog install` only sets up a Claude Code hook. Codex logs are still
read by `burnlog scan`, `burnlog sync`, and `burnlog daemon`, but there is no
Codex auto-installer yet. Hermes should use the SDK/manual integration path for
now, and openclaw is still stubbed.

Reads `~/.claude/projects/*/*.jsonl`, `~/.codex/sessions/**/*.jsonl`, etc.
Nothing besides token counts leaves your machine. Run `burnlog sync` any time,
or `burnlog daemon` for a background watcher. See [cli/README](cli/README.md).

### SDK — for your own agents

```bash
npm install @sxna/burnlog-sdk
```

```ts
import { Burnlog } from "@sxna/burnlog-sdk";

const burnlog = Burnlog.fromEnv({ source: "my-agent" });

const res = await anthropic.messages.create({ /* ... */ });
burnlog.trackResponse(res);   // batches + flushes in the background
```

Zero runtime dependencies. `track()` never throws. `trackResponse()` auto-detects common Anthropic/OpenAI usage shapes. See [sdk/README](sdk/README.md).

### MCP — query your rank from inside an agent

Drop this into `~/.claude.json` (Claude Code) or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "burnlog": {
      "command": "npx",
      "args": ["-y", "@sxna/burnlog-mcp"],
      "env": { "BURNLOG_API_KEY": "blg_your_key_here" }
    }
  }
}
```

Then ask your agent *"what's my rank"* or *"who's top of the leaderboard"*.
Tools: `get_my_rank`, `get_my_stats`, `get_leaderboard`, `find_user`. See
[mcp/README](mcp/README.md).

## Self-host the web app

```bash
git clone https://github.com/sharziki/burnlog
cd burnlog
cp web/.env.example web/.env
# fill in AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
docker compose up -d
```

Open <http://localhost:3000>. Point any of the three surfaces at it by
setting `BURNLOG_API_URL=http://localhost:3000` (or `baseUrl` for the SDK).

## Repo layout

```
burnlog/
├── web/      Next.js 15 + Prisma + NextAuth GitHub + Postgres
├── cli/      @sxnalabs/burnlog   — multi-adapter log reader
├── sdk/      @sxna/burnlog-sdk   — in-agent tracker, zero deps
├── mcp/      @sxna/burnlog-mcp   — MCP server for readback
└── .github/  CI + per-package release workflows
```

## Ranks

| Rank      | Tokens         |
| --------- | -------------- |
| Spark     | 0 – 100K       |
| Ember     | 100K – 500K    |
| Blaze     | 500K – 2M      |
| Inferno   | 2M – 10M       |
| Supernova | 10M+           |

## How token counts are collected

The CLI walks local log files written by your agents and extracts `usage`
blocks. Dedup is keyed by a request id from the source (e.g. Anthropic
`requestId`, Codex session `id`). Nothing else leaves your machine.

| Agent        | Path                           | Status |
| ------------ | ------------------------------ | ------ |
| Claude Code  | `~/.claude/projects/*/*.jsonl` | live   |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl` | live   |
| Hermes       | n/a                            | use SDK/manual integration today |
| openclaw     | n/a                            | detection stub only |

For anything not on this list, reach for the SDK.

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs.

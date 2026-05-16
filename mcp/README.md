# @sxna/burnlog-mcp

> MCP server for [burnlog](https://github.com/sharziki/burnlog). Query your rank, stats, and the leaderboard from inside Claude Code / Cursor / any MCP host.

## Install

Add to your MCP host config — no install needed, `npx` handles it.

### Claude Code (`~/.claude.json`)

```json
{
  "mcpServers": {
    "burnlog": {
      "command": "npx",
      "args": ["-y", "@sxna/burnlog-mcp"],
      "env": {
        "BURNLOG_API_KEY": "blg_your_key_here"
      }
    }
  }
}
```

Or via the CLI: `claude mcp add burnlog -s user -- npx -y @sxna/burnlog-mcp` then set the env var.

### Cursor (`.cursor/mcp.json`)

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

Grab a key at <https://burnlog.net/settings>.

## Tools

| Tool              | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `get_my_rank`     | Current rank (Spark → Supernova), position, total tokens    |
| `get_my_stats`    | Full breakdown: totals, providers, top models, streak       |
| `get_leaderboard` | Top N users (default 10, max 50)                            |
| `find_user`       | Look up any user by GitHub username                         |

Usage in-agent:

> "how many tokens have I burned this week" → `get_my_stats`
> "what's my rank" → `get_my_rank`
> "who's top of the leaderboard" → `get_leaderboard`
> "find zara.dev" → `find_user`

## Environment

```
BURNLOG_API_KEY    required. grab at https://burnlog.net/settings
BURNLOG_API_URL    optional. override for self-hosted instances.
```

## Self-hosting

Point at your burnlog instance:

```json
"env": {
  "BURNLOG_API_KEY": "...",
  "BURNLOG_API_URL": "https://burn.mycompany.com"
}
```

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs

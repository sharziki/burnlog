# @sxna/burnlog

> Private leaderboard for AI token burn. Track every token you push through Claude Code, Codex, and other AI coding agents — tokens only, never prompts.

```
npm install -g @sxna/burnlog
burnlog login <api-key>     # grab a key from https://burnlog.sxna.dev/settings
burnlog install             # wires a Claude Code hook — auto-sync on session end
```

That's it. Close Claude Code when you're done, and your burn syncs. You can
also run `burnlog sync` any time to push manually.

## What it reads

burnlog walks local log files written by your coding agents and extracts the
`usage` blocks. It **never** reads prompt text, file contents, project paths,
or anything else that could identify what you were working on — only the
token counts and a random dedup id.

| Agent        | Path                                          |
| ------------ | --------------------------------------------- |
| Claude Code  | `~/.claude/projects/*/*.jsonl`                |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl`                |
| Hermes       | `~/.hermes/` (stub, pending format)           |
| openclaw     | `~/.openclaw/` (stub, pending format)         |

Override any root with `BURNLOG_CLAUDE_DIR`, `BURNLOG_CODEX_DIR`, etc.

## Commands

```
burnlog login <api-key>       save your api key (stored in ~/.burnlog/config.json, mode 600)
burnlog scan                  parse logs locally, show totals (does not upload)
burnlog sync [--quiet]        upload new burn events to the leaderboard
burnlog status                show current config
burnlog install               install a Claude Code hook for automatic sync
burnlog uninstall             remove the Claude Code hook
burnlog daemon                run a background watcher that syncs every 30s
burnlog logout                delete the stored api key
```

## Environment

```
BURNLOG_API_URL        override the leaderboard url (default https://burnlog.sxna.dev)
BURNLOG_CLAUDE_DIR     override ~/.claude/projects
BURNLOG_CODEX_DIR      override ~/.codex/sessions
BURNLOG_HERMES_DIR     hermes log dir (once it writes usage)
BURNLOG_OPENCLAW_DIR   openclaw log dir (once it writes usage)
```

## Self-hosting

burnlog is open source. You can run the entire stack — Postgres + Next.js —
and point the CLI at your instance:

```
BURNLOG_API_URL=https://burn.mycompany.com burnlog sync
```

Source: [github.com/sharziki/burnlog](https://github.com/sharziki/burnlog).

## Privacy

What we store: token counts, model name, provider, timestamp, a random
dedup id. What we don't: prompts, responses, filenames, cwd, session ids,
tool output, anything content-like. Full details: [burnlog.sxna.dev/privacy](https://burnlog.sxna.dev/privacy).

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs

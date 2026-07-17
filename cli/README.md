# @sxnalabs/burnlog

> Private leaderboard for AI token burn. Track every token you push through Claude Code, Codex, and other AI coding agents — tokens only, never prompts.

```
npm install -g @sxnalabs/burnlog
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
burnlog budget                show joined team budget usage
burnlog budget --club <slug>  show one team by slug or id
burnlog budget --fail-on-over exit 2 when any joined team is over budget
burnlog report [--club <slug>] export team usage CSV
burnlog install               install a Claude Code hook for automatic sync
burnlog uninstall             remove the Claude Code hook
burnlog daemon                run a background watcher that syncs every 30s
burnlog logout                delete the stored api key
```

CI budget gate:

```
BURNLOG_API_KEY=blg_team_or_user_key burnlog budget --fail-on-over --json
BURNLOG_API_KEY=blg_user_key burnlog budget --club platform --fail-on-warning
```

Use a team API key to check only that team. User API keys check every team the
user has joined.

CSV report:

```
BURNLOG_API_KEY=blg_team_or_user_key burnlog report --club platform --from 2026-06-01 --to 2026-06-30 --out burnlog.csv
```

With a team API key, `--club` can be omitted because the key sees only one team.
Service usage in the CSV is split by team API key label for new events.

## Environment

```
BURNLOG_API_URL        override the leaderboard url (default https://burnlog.sxna.dev)
BURNLOG_API_KEY        api key for CI/non-interactive use
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

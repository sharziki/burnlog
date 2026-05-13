# @sxnalabs/burnlog

> Private leaderboard for AI token burn. Track every token you push through Claude Code, Codex, and other AI coding agents — tokens only, never prompts.

```bash
npm install -g @sxnalabs/burnlog
burnlog login <api-key>     # grab a key from https://burnlog.net/settings
burnlog install             # Claude Code only: auto-sync on session end
```

`burnlog install` only wires a Claude Code hook today. Codex logs are still read by
`burnlog scan`, `burnlog sync`, and `burnlog daemon`, but there is no Codex-specific
hook installer yet. Hermes should use the SDK/manual path for now.

## What it reads

burnlog walks local log files written by your coding agents and extracts the
`usage` blocks. It **never** reads prompt text, file contents, project paths,
or anything else that could identify what you were working on — only token
counts and a random dedup id.

- Claude Code: `~/.claude/projects/*/*.jsonl`
- OpenAI Codex: `~/.codex/sessions/**/*.jsonl`
- Hermes: no passive CLI log ingestion yet; use the SDK/manual integration path
- openclaw: detection stub only; parser not implemented yet

Override roots with environment variables such as `BURNLOG_CLAUDE_DIR` and
`BURNLOG_CODEX_DIR`. `BURNLOG_HERMES_DIR` and `BURNLOG_OPENCLAW_DIR` are
reserved for future passive adapters once those runtimes expose stable usage
logs.

## Commands

```text
burnlog login <api-key>       validate and save your api key (~/.burnlog/config.json, mode 600)
burnlog scan                  parse logs locally, show totals (does not upload)
burnlog sync [--quiet]        upload new burn events to the leaderboard
burnlog status                show config, adapter detection, hook state, and api status
burnlog install               install a Claude Code hook for automatic sync
burnlog uninstall             remove the Claude Code hook
burnlog daemon                run a background watcher that syncs every 30s
burnlog logout                delete the stored api key
```

## Environment

```text
BURNLOG_API_URL        override the api url (default https://burnlog.net)
BURNLOG_CLAUDE_DIR     override ~/.claude/projects
BURNLOG_CODEX_DIR      override ~/.codex/sessions
BURNLOG_HERMES_DIR     reserved for a future passive Hermes adapter
BURNLOG_OPENCLAW_DIR   reserved for a future openclaw adapter
```

## Self-hosting

burnlog is open source. You can run the entire stack — Postgres + Next.js —
and point the CLI at your instance:

```bash
BURNLOG_API_URL=https://burn.mycompany.com burnlog sync
```

Source: [github.com/sharziki/burnlog](https://github.com/sharziki/burnlog).

## Privacy

What we store: token counts, model name, provider, timestamp, and a random
dedup id. What we don't: prompts, responses, filenames, cwd, session ids,
tool output, or anything content-like. Full details:
[burnlog.net/privacy](https://burnlog.net/privacy).

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs

# @sxnalabs/burnlog

> Private leaderboard for AI token burn. Track every token you push through Claude Code, Codex, and other AI coding agents — tokens only, never prompts.

```
npx @sxnalabs/burnlog
```

One command. It scans for your agents and shows you your own numbers first,
then signs you in through the browser, uploads, and offers to auto-sync from
then on. Nothing is asked of you before you've seen what it found.

## Two ways it counts

**1. Log scraping** — burnlog walks local log files written by your coding
agents and extracts the `usage` blocks. It **never** reads prompt text, file
contents, project paths, or anything else that could identify what you were
working on — only the token counts and a random dedup id.

| Agent        | Path                                          |
| ------------ | --------------------------------------------- |
| Claude Code  | `~/.claude/projects/*/*.jsonl`                |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl`                |
| Hermes       | `~/.hermes/` (stub, pending format)           |
| openclaw     | `~/.openclaw/` (stub, pending format)         |
| open sink    | `~/.burnlog/events/*.jsonl`                   |

Override any root with `BURNLOG_CLAUDE_DIR`, `BURNLOG_CODEX_DIR`,
`BURNLOG_EVENTS_DIR`.

**2. `burnlog wrap`** — for the many tools that never write usage to disk
(Cursor, Gemini CLI, aider, your own scripts), count at the wire instead:

```
burnlog wrap -- aider
burnlog wrap -- python my_agent.py
burnlog wrap --only anthropic,openai -- npm run agent
burnlog wrap --list
```

`wrap` runs your command with the standard base-URL environment variables
pointed at a loopback proxy, forwards each request upstream untouched, and
reads the `usage` block out of the response — streaming or not.

Supported: Anthropic, OpenAI, Google, Mistral, Cohere, OpenRouter, Groq, xAI,
DeepSeek, Together, Fireworks, Perplexity, Cerebras, Ollama. Anything else with
an OpenAI-compatible API works via `OPENAI_BASE_URL`.

There is **no HTTPS interception** and no local CA — that's why it's base-URL
redirection rather than a CONNECT proxy. Request bodies are never inspected
beyond reading `model` when the response doesn't name it. Events are written to
`~/.burnlog/events/` before any upload, so a wrapped command keeps working with
no network and no API key.

## The open sink

Any tool, in any language, can participate without waiting on a burnlog
release. Append one JSON object per line to `~/.burnlog/events/<date>.jsonl`
and `burnlog sync` picks it up:

```json
{"model":"gpt-5","inputTokens":1200,"outputTokens":340,"source":"my-tool","timestamp":"2026-08-11T14:00:00Z"}
```

Or use the command:

```
burnlog log 42000 --model claude-opus-4-6 --source my-batch-job
burnlog log 0 --in 30000 --out 12000 --model gpt-5
```

## Commands

```
burnlog                       scan, sign in, sync, install the hook (same as `setup`)
burnlog login [api-key]       browser sign-in; pass a key for CI (~/.burnlog/config.json, mode 600)
burnlog scan                  parse logs locally, show totals (does not upload)
burnlog sync [--quiet]        upload new burn events to the leaderboard
burnlog wrap -- <cmd>         count any command's LLM calls, any provider
burnlog log <tokens>          record usage by hand
burnlog challenge             list challenges · `new` to start one · `join <code>`
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

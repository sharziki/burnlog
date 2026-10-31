# @sxnalabs/burnlog

> Private leaderboard for AI token burn. Track every token you push through Claude Code, Codex, Cursor, Gemini, Copilot, pi, and 50 other AI coding agents — tokens only, never prompts.

```
npx @sxnalabs/burnlog
```

One command. It scans for your agents and shows you your own numbers first,
then signs you in through the browser, uploads, and offers to auto-sync from
then on. Nothing is asked of you before you've seen what it found.

## Two ways it counts

**1. Log scraping** — burnlog opens local agent log files and extracts their
`usage` blocks. It uploads token counts, model, timestamp, and an opaque dedup
ID; it does not upload prompts, code, filenames, or project paths.

| Agent | Where the numbers come from |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl` |
| Cursor | Cursor's own usage records, fetched with the local Cursor login (sent only to cursor.com) |
| Gemini CLI | `~/.gemini/tmp/**` |
| GitHub Copilot | `~/.copilot/` (CLI + desktop) and VS Code chat sessions |
| opencode, pi, Amp, Factory Droid, Cline, Roo Code, Kilo Code, Goose, Zed, Qwen Code, Kimi, Junie, Kiro, Antigravity, Grok, Hermes, Devin, Augment, jcode, Codebuff, and ~30 more | each agent's own session store — `burnlog scan` lists what it found |
| open sink | `~/.burnlog/events/*.jsonl` |

Every source's root can be overridden with `BURNLOG_<SOURCE>_DIR`. Session
parsing is ported from [tokscale](https://github.com/junhoyeo/tokscale) (MIT).

**2. `burnlog wrap`** — for tools that keep no usage record at all (aider,
Windsurf, your own scripts), count at the wire instead:

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
burnlog scan --json           exact per-source token buckets; no paths or session IDs
burnlog sync [--quiet]        upload new burn events to the leaderboard
burnlog wrap -- <cmd>         count any command's LLM calls, any provider
burnlog log <tokens>          record usage by hand
burnlog challenge             list challenges · `new` to start one · `join <code>`
burnlog status                show sync health, active sync mechanisms, and rank
burnlog budget                show joined team budget usage
burnlog budget --club <slug>  show one team by slug or id
burnlog budget --fail-on-over exit 2 when any joined team is over budget
burnlog report [--club <slug>] export team usage CSV
burnlog install               install a 30-minute schedule and Claude Code hook
burnlog install --schedule-only  install the schedule without a hook
burnlog uninstall             remove both schedule and hook; keeps sign-in
burnlog daemon                sync every 30s while this process runs
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

## Auto-sync and recovery

`burnlog install` creates a user-level 30-minute cron job (macOS/Linux) or Task Scheduler task (Windows). It also adds a Claude Code session-end hook for faster updates. `--schedule-only` skips the hook. `burnlog uninstall` removes both; it does not sign you out. Neither `install` nor `connect` is needed for manual sync.

`burnlog status` shows the installed mechanisms, last attempt, last success, and last error. A quiet scheduled run still exits nonzero on upload failure and saves the error for the next status check. A failed batch leaves the sync checkpoint unchanged, so the next run retries it. `burnlog sync --full` scans all history; already uploaded request IDs are skipped by the server.

## Windows PowerShell command discovery

If `npm install -g @sxnalabs/burnlog` succeeds but `burnlog` is not recognized, use `npx -y @sxnalabs/burnlog@latest status` (or replace `status` with `connect`, `sync`, or another command). Check the global executable directory with `npm prefix -g`; on Windows it should contain `burnlog.cmd`. `Get-Command burnlog` tells you whether PowerShell can find it. If the shim exists but the command is missing, add that directory to your **user PATH**, then open a new PowerShell session. If `burnlog.cmd` does not exist, reinstall the package. A new session is needed after changing PATH, not merely after installing into a directory already on PATH.

## Reconcile token totals with ccusage

Run `burnlog scan --json` and compare its exact `rankedTokens` per source with ccusage over the **same machines and full available history**. Burnlog's ranked total is fresh input + output + cache creation; cache reads are reported in a separate bucket and excluded. Codex's `input_tokens` includes `cached_input_tokens`, so Burnlog subtracts cached input before ranking. Claude Code's cache read and cache creation fields are separate from `input_tokens`; creation counts toward rank. The adapters also differ in which source files and agents they support. `scannedFiles` and `events` help identify coverage gaps without sharing private logs.

Claude Code nested subagent transcripts are included from 0.9.2. To backfill newly discovered events after upgrading, run `burnlog sync --full` once. This does not rewrite older server events with the same request ID; historical totals created by older adapter versions may still differ. If a gap remains, share only `scan --json` aggregates and source/version details, never transcripts or session IDs.

## Environment

```
BURNLOG_API_URL        override the leaderboard url (default https://burnlog.net)
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
tool output, anything content-like. Full details: [burnlog.net/privacy](https://burnlog.net/privacy).

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs

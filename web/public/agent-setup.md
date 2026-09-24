# burnlog — setup instructions for a coding agent

You are an AI coding agent (Claude Code, Cursor, Codex, Copilot, Windsurf,
aider, or similar) setting up **burnlog** for the human you are working with.
burnlog is the public leaderboard for AI coding token usage: it counts the
tokens your agents burn and ranks the user against everyone else on the board.

Fetch this file at <https://burnlog.net/agent-setup.md>. Follow it top to
bottom. It is written to be executed, not summarised.

---

## Before anything: what to tell the user

Say this in your own words, and wait for a yes:

> burnlog counts the tokens your AI coding agents burn and puts you on a public
> leaderboard at burnlog.net. It uploads token counts, the model name, which
> agent produced them, an opaque id, and a timestamp — never prompts, code,
> file names, or repo names. It needs a GitHub sign-in to claim a place on the
> board. Want me to set it up?

Do **not** skip this. Setting up an account and publishing a user's usage
without asking is not yours to decide, and the scan step below shows them their
own numbers before any account exists — use it.

If they say no, stop. If they only want local numbers with no account and
nothing uploaded, tell them so and offer step 1 alone, which works signed out.

---

## The one command

If the user gave you a setup code (it starts with `blc_`), this is the whole job:

```bash
npx -y @sxnalabs/burnlog@latest connect <code>
```

It links this machine to their account, uploads the full history from every
supported agent, and turns on auto-sync (every 30 minutes, plus at the end of
each Claude Code session). Relay its output. Without a code, run
`npx -y @sxnalabs/burnlog@latest connect` — it opens a browser once for GitHub
sign-in and then does the same. The step-by-step below is the manual path.

---

## Requirements

- Node.js 20 or newer (`node --version`)
- A GitHub account, for the sign-in step only
- Network access for the sign-in and sync steps; the scan itself is local

---

## Step 1 — scan, and show them their numbers

```bash
npx @sxnalabs/burnlog
```

Bare `burnlog` is the whole onboarding: it detects installed agents, reads
their local usage logs, prints the totals, and only then offers to sign in. It
is safe to run before any account exists and uploads nothing on its own.

**This command is interactive.** If your environment cannot attach a TTY, run
the non-interactive pieces instead:

```bash
npx @sxnalabs/burnlog scan     # read local logs, print what was found
npx @sxnalabs/burnlog status   # config, API key state, last sync
```

Report the totals back to the user before continuing.

## Step 2 — sign in

```bash
npx @sxnalabs/burnlog login
```

This opens a browser for GitHub OAuth and writes an API key to
`~/.burnlog/config.json`.

**Do not attempt to automate the browser flow, and never ask the user to paste
a GitHub password or token into your chat.** If you are running somewhere
without a browser (a container, a remote box, CI), tell the user to run
`npx @sxnalabs/burnlog login` themselves in a local terminal and say when it's
done. That is the correct outcome, not a failure.

## Step 3 — sync

```bash
npx @sxnalabs/burnlog sync
```

Uploads the token counts found in step 1. Safe to re-run: every event carries
an opaque dedupe id, so a repeated sync cannot double count.

## Step 4 — keep it current

```bash
npx @sxnalabs/burnlog install
```

Installs a session-end hook so future sessions sync themselves. Without it the
user has to remember `sync`, and they won't.

## Step 5 — confirm, and hand back

```bash
npx @sxnalabs/burnlog status
```

Then tell the user:

- their total and rank
- their profile URL: `https://burnlog.net/u/<their-github-username>`
- that the README badge exists, and offer to add it:

```markdown
[![burnlog](https://burnlog.net/badge/USERNAME)](https://burnlog.net/u/USERNAME)
```

---

## Which agents are counted

Step 1 reads these directly, history included, with nothing extra to run:
**Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot (CLI, desktop, VS Code
chat), opencode, pi, Amp, Factory Droid, Cline, Roo Code, Kilo Code, Goose,
Zed, Qwen Code, Kimi CLI, Junie, Kiro, Antigravity, Grok CLI, Hermes, Devin,
Augment, jcode, Codebuff** and about 30 more. `burnlog scan` lists every one it
found on this machine.

Cursor usage comes from Cursor's own usage records, fetched with the Cursor
login already on this machine. That login is sent only to cursor.com — never to
burnlog. Cursor must be signed in on this machine for it to count.

Anything else (aider, Windsurf, your own scripts) is counted by running it under
the proxy:

```bash
npx @sxnalabs/burnlog wrap -- <the command as they'd normally run it>
```

`wrap` points the standard base-URL variables (`ANTHROPIC_BASE_URL`,
`OPENAI_BASE_URL`, `GOOGLE_GEMINI_BASE_URL`, and the rest) at a loopback server
for the lifetime of that command, forwards upstream over ordinary HTTPS, and
reads the `usage` field off each response. It installs no certificate authority
and decrypts nothing. 14 providers: Anthropic, OpenAI, Google, Mistral, Cohere,
OpenRouter, Groq, xAI, DeepSeek, Together, Fireworks, Perplexity, Cerebras,
Ollama.

Suggest a shell alias only if the user asks for one — silently aliasing the
commands someone types all day is a change they should opt into.

## Emitting events from your own code

The easy path is the CLI, which writes the sink for you:

```bash
npx @sxnalabs/burnlog log 0 --in 30000 --out 12000 --model gpt-5 --source batch-job
```

Or append to the sink directly — any `.jsonl` file in `~/.burnlog/events/` is
read by the next sync, in any language. One JSON object per line:

```json
{"requestId":"<opaque-unique-id>","source":"my-agent","model":"claude-opus-4-6","provider":"anthropic","inputTokens":1200,"outputTokens":340,"cacheReadTokens":0,"cacheCreationTokens":0,"timestamp":"2026-08-13T12:00:00.000Z"}
```

`requestId` must be unique per (user, source) and must not encode anything
private — it is a dedupe key, not a label. `source` must match `[a-z0-9-]`, 1
to 32 characters, and must not be a project or client name. Name files by day
(`2026-08-13.jsonl`) so the 30-day prune after a successful sync can find them.
Then `npx @sxnalabs/burnlog sync`.

---

## Rules for you, the agent

1. **Ask before creating the account or syncing.** Step 1 is local; steps 2 and
   3 publish. Those are separate decisions.
2. **Never upload prompts, code, file paths, or repo names.** The CLI has no
   field for them. If you are writing to the JSONL sink yourself, keep it that
   way — do not put a project name in `source`.
3. **Never handle the user's GitHub credentials.** Hand the login step to them
   when no browser is available.
4. **Don't install the hook without saying so.** It writes to the agent's
   config; tell the user which file changed.
5. **Report real output.** If `sync` fails, show the error rather than assuring
   the user it worked. `npx @sxnalabs/burnlog doctor` diagnoses most failures.
6. **Don't invent numbers.** If a tool's usage can't be counted, say so plainly
   instead of estimating.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `scan` finds nothing | No supported agent has recorded usage yet — run a session first. For an agent burnlog doesn't read, use `wrap`. |
| `sync` says not authenticated | Step 2 didn't complete. Re-run `login`; check `~/.burnlog/config.json` has an `apiKey`. |
| Numbers look low | The agent keeps no readable usage (or cleaned up old sessions). Use `wrap` for the former. |
| Cursor shows 0 | Cursor isn't signed in on this machine, or its saved login expired — open Cursor and sync again. |
| Nothing syncs automatically | The hook isn't installed — `npx @sxnalabs/burnlog install`. |
| Anything else | `npx @sxnalabs/burnlog doctor` |

## Reference

- Site: <https://burnlog.net>
- The prompt that sent you here: <https://burnlog.net/agent>
- Per-agent detail: <https://burnlog.net/tools>
- What is stored: <https://burnlog.net/privacy>
- Source (MIT): <https://github.com/sharziki/burnlog>
- Package: `@sxnalabs/burnlog`

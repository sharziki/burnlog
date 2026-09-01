# Launch copy

Drafts, not scripture — rewrite in your own voice before posting. Every number
here was true on 2026-09-01; check them again before you hit send, because the
board moves.

Assets are in `marketing/out/`. Rule of thumb: **`paste` is the launch video**,
`board` is the follow-up, `launch` goes on a page rather than in a feed.

---

## X / Twitter — the main post

Attach `burnlog-paste-1920x1080.mp4`.

> Your agents burned tokens all day. You have no idea how many.
>
> burnlog counts them — Claude Code, Codex, Cursor, whatever you run — and puts
> you on a public board against everyone else plugged in.
>
> Setup is one paste. You don't install it; your agent does.
>
> burnlog.net

**Reply, immediately, in your own thread** — this is where the technical
audience actually decides:

> Tokens only. Never prompts, code, file names, or repo names — there is no
> field in the schema for them.
>
> The CLI is MIT. It reads the logs Claude Code and Codex already write, so
> your first sync counts history you had before you heard of this.
>
> Anything with no usage log gets counted at the wire by a loopback proxy. No
> certificate to install, no HTTPS interception.

**Second reply** — attach `burnlog-board-1080x1080.mp4`:

> 11 ranks, log scale, topping out at 10T. Nobody has reached the top one.
>
> burnlog.net/agent

---

## Show HN

Title:

> Show HN: Burnlog – A public leaderboard for AI coding token usage

Body:

> I kept wondering how much my agents were actually burning, and every answer
> was either a billing page with a dollar figure or nothing at all. So I built
> the scoreboard version.
>
> burnlog reads the usage logs Claude Code and Codex already write to disk, and
> for the tools that keep no log — Cursor on your own key, Gemini CLI, aider —
> it counts at the wire with a loopback proxy that reads the `usage` field off
> the response. No local CA, no HTTPS interception, and the request body is
> never inspected.
>
> Token counts only. Never prompts, code, file names, or repo names; there is
> no column for them. Full detail at burnlog.net/privacy.
>
> The setup I am most pleased with is that you don't do it. You paste a prompt
> into whatever agent you already have open, it fetches burnlog.net/agent-setup.md
> — written to be executed rather than read — and it runs the whole thing,
> showing you your own numbers before an account exists and asking before
> anything is published.
>
> The CLI is MIT: github.com/sharziki/burnlog
>
> Known limits, since they'll come up: Cursor on its included subscription is
> genuinely uncountable, because those tokens are spent on Cursor's servers and
> never touch your machine. And ingest is honour-system — there is no
> plausibility ceiling, deliberately, because the cap I tried first quietly
> deleted real burn from the heaviest users. I'd rather answer gaming with
> attribution than throw away data that might be true.

---

## Product Hunt

Tagline (60 char max):

> The public leaderboard for AI coding token usage

Description:

> burnlog counts every token your AI coding agents burn — Claude Code, Codex,
> Cursor, Gemini CLI, aider, your own scripts — and ranks you against everyone
> else plugged in. Eleven ranks on a log scale, a README badge that updates
> itself, and a setup you delegate to the agent already sitting in front of you.
> Tokens only: never prompts, code, or file names. The CLI is MIT.

Gallery order: `paste` video first, then `board`, then screenshots of `/` and
`/agent`.

---

## The replies you should have ready

**"What stops me faking a huge number?"**
Nothing, today, and that is a deliberate trade rather than an oversight. There
was a plausibility ceiling early on and it silently deleted real burn from the
heaviest users — the people the board is *for*. The answer is attribution and
anomaly reporting, not discarding numbers that might be true. Say that plainly;
it is a better answer than pretending the problem doesn't exist.

**"This is just ccusage / viberank."**
Point at burnlog.net/vs/ccusage — those pages say when the other tool is the
better choice, which is why they're worth linking rather than arguing.

**"Why would I want my usage public?"**
You wouldn't, necessarily. It's a leaderboard; the appeal is competitive, not
analytical. Self-hosting is one `docker compose up`.

**"Does it slow down my agent?"**
Log reading happens after the fact and touches nothing. `wrap` adds one
loopback hop and forwards upstream untouched.

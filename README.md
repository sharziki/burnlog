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
what we do and don't store, and [security posture](web/src/app/security/page.tsx)
for deployment and control details.

## Three ways to plug in

Pick the one that matches how your tokens are produced.

| You have…                           | Use              | Package              |
| ----------------------------------- | ---------------- | -------------------- |
| Claude Code, Codex, or similar CLI  | **CLI**          | `@sxnalabs/burnlog`  |
| Your own agent calling an LLM SDK   | **SDK**          | `@sxna/burnlog-sdk`  |
| Claude Code / Cursor and want to ask it about your rank | **MCP server** | `@sxna/burnlog-mcp` |

### CLI — for agents that write logs to disk

```bash
npm install -g @sxnalabs/burnlog
burnlog login <api-key>      # grab one at https://burnlog.sxna.dev/settings
burnlog install              # auto-sync on every Claude Code session end
```

Reads `~/.claude/projects/*/*.jsonl`, `~/.codex/sessions/**/*.jsonl`, etc.
Nothing besides token counts leaves your machine. Run `burnlog sync` any
time, or `burnlog daemon` for a background watcher. See [cli/README](cli/README.md).

### SDK — for your own agents

```bash
npm install @sxna/burnlog-sdk
```

```ts
import { Burnlog } from "@sxna/burnlog-sdk";

const burnlog = new Burnlog({
  apiKey: process.env.BURNLOG_API_KEY!,
  source: "my-agent",
});

const res = await anthropic.messages.create({ /* ... */ });
burnlog.trackAnthropic(res);   // batches + flushes in the background
```

Zero runtime dependencies. `track()` never throws. See [sdk/README](sdk/README.md).

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

Then ask your agent *"what's my rank"*, *"which team is over budget"*, or
*"who's top of the leaderboard"*. Tools: `get_my_rank`, `get_my_stats`,
`get_my_clubs`, `get_leaderboard`, `find_user`. See
[mcp/README](mcp/README.md).

## Team budget API

Use the same API key from `/settings` to pull team usage into internal
dashboards, CI, or finance checks:

```bash
curl -H "Authorization: Bearer $BURNLOG_API_KEY" \
  https://burnlog.sxna.dev/api/me/clubs
```

Returns joined teams, member totals, 7-day and month-to-date burn, monthly
token budget, budget percentage used, and `ok` / `warning` / `over` status.

Team owners can generate a team API key from a club page. Events sent with that
key are attributed to the team budget as shared service/CI usage instead of
personal CLI usage. Each plan caps active team keys; revoke old keys before
minting replacements. Label keys by system, for example
`github-actions`, `cursor-agent`, or `prod-ci`, so rotation is obvious later.
Optionally set a monthly token cap per team API key; ingest rejects with
`api_key_budget_exceeded` when that key would cross its cap. Owners can see
month-to-date usage for each team key beside the cap.

Use the CLI as a CI budget gate:

```bash
BURNLOG_API_KEY=$BURNLOG_API_KEY burnlog budget --fail-on-over --json
BURNLOG_API_KEY=$BURNLOG_API_KEY burnlog budget --club sxna-ai-platform --fail-on-warning
BURNLOG_API_KEY=$BURNLOG_API_KEY burnlog report --club sxna-ai-platform --from 2026-06-01 --to 2026-06-30 --out burnlog.csv
```

Use a team API key in CI when the gate should only check that one team. User
API keys check every team the user has joined. With a team API key,
`burnlog report` can omit `--club`.

Plans set product caps without wiring billing yet:

| Plan | Members | Team API keys |
| ---- | ------- | ------------- |
| free | 5       | 2             |
| team | 25      | 10            |
| enterprise | 500 | 50          |

After a paid pilot or invoice, admins can upgrade a team:

```bash
curl -X PATCH -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"plan":"team"}' \
  https://burnlog.sxna.dev/api/clubs/<club-id>/plan
```

If the club owner has a matching team lead email, paid plan upgrades mark that
lead `won`; paid-to-free downgrades mark it `lost`. Status changes are written
into club audit metadata.
Plan changes that would put existing seats or team API keys over the target
plan return `plan_limit_conflict`; resend with `"force": true` to override.
Forced overrides, current counts, and target limits are recorded in audit
metadata.

Owners and admins can inspect the last 100 sensitive team changes:

```bash
curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  https://burnlog.sxna.dev/api/clubs/<club-id>/audit
```

Audit events cover plan changes, budget/privacy/webhook changes, and team API
key create/revoke actions.

Team owners can also set an HTTPS budget webhook on the club page. burnlog
POSTs JSON when the monthly budget crosses 80% or 100%:

```json
{
  "type": "club_budget",
  "clubName": "Platform",
  "threshold": 80,
  "usedTokens": 4200000,
  "budgetTokens": 5000000,
  "percentUsed": 84
}
```

Set `BURNLOG_WEBHOOK_SECRET` to sign webhook bodies. Receivers verify
`x-burnlog-signature` by computing HMAC-SHA256 over
`x-burnlog-timestamp + "." + rawBody`:

```ts
createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
```

After saving a webhook URL, owners can send a test payload from the club page.
The same path is available as `POST /api/clubs/<club-id>/webhook/test`.
Owners can also enable hard budget guard on the club page. When enabled,
team API key ingest is rejected with `budget_exceeded` once the current request
would push month-to-date usage over the monthly budget.

Team members can export club usage as CSV from the club page. Add `from` and
`to` dates when finance needs a billing period:

```bash
curl -b "$AUTH_COOKIE" \
  "https://burnlog.sxna.dev/api/clubs/<club-id>/report?from=2026-06-01&to=2026-06-30"

curl -H "Authorization: Bearer $BURNLOG_API_KEY" \
  "https://burnlog.sxna.dev/api/clubs/<club-id>/report?from=2026-06-01&to=2026-06-30"
```

CSV includes `weekly_tokens` and `mtd_tokens`; `mtd_tokens` is calendar
month-to-date in UTC, matching monthly budget alerts. Team-key service usage
is split by API key label for new ingested events; older service events without
a stored key id appear as `Team API keys`.

Estimated spend defaults to `$0.00001` per token. Set
`BURNLOG_DOLLARS_PER_TOKEN` for CSV exports and
`NEXT_PUBLIC_BURNLOG_DOLLARS_PER_TOKEN` for browser estimates when your internal
blended rate is different.

## Team pilots

`/teams` has a small intake form for companies that want private workspaces,
team API keys, budget alerts, or reports. Leads are stored in Postgres and can
be exported as CSV with an admin token:

```bash
curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  https://burnlog.sxna.dev/api/team-leads > team-leads.csv

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/team-leads?format=json&status=qualified"

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/team-leads?format=json&source=linkedin"

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  https://burnlog.sxna.dev/api/admin/summary

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/admin/clubs?plan=team"

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/admin/clubs?plan=team&format=csv" > team-accounts.csv

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/admin/clubs?plan=team&format=csv&from=2026-06-01&to=2026-06-30" > june-team-accounts.csv

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/admin/clubs?overLimit=true&format=csv" > over-limit-accounts.csv

curl -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  "https://burnlog.sxna.dev/api/admin/clubs?budgetRisk=true&format=csv" > budget-risk-accounts.csv

curl -X PATCH -H "Authorization: Bearer $BURNLOG_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"email":"buyer@example.com","status":"qualified","adminNotes":"Security review next"}' \
  https://burnlog.sxna.dev/api/team-leads
```

Set `BURNLOG_ADMIN_TOKEN` in production. Leave it blank to disable export.
Operators can also open `/admin` and enter the same token on a trusted machine
to triage leads, review account risk, pick invoice periods, export CSVs, and
apply plan changes. The admin UI can filter account reloads and exports by
plan, filter lead reloads/exports by status or source, and forget the stored
token after use.
Lead statuses: `new`, `contacted`, `qualified`, `pilot`, `won`, `lost`.
The teams form stores `utm_source` or `ref` as lead `source`; otherwise it uses
`teams_page`.
Admin summary includes lead counts by status/source, plan counts, over-limit
account count, forced plan override count/recent list, MTD tokens, and estimated
MRR from known Team seats. Admin club list returns owner emails, seat counts,
team key counts, matching lead status/notes by owner email, billing-period
tokens/spend, budget percent/status, and per-club estimated MRR. It also flags
accounts over current plan limits after forced changes. Use `from` / `to` for
invoice periods; default is UTC month-to-date. Enterprise revenue is custom and
not estimated.

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

Health check:

```bash
curl http://localhost:3000/api/health
```

Returns `200` when the web app can reach Postgres, `503` when the database is
down. Docker images and compose files use this endpoint for web health.

## Repo layout

```
burnlog/
├── web/      Next.js 15 + Prisma + NextAuth GitHub + Postgres
├── cli/      @sxnalabs/burnlog  — multi-adapter log reader
├── sdk/      @sxna/burnlog-sdk  — in-agent tracker, zero deps
├── mcp/      @sxna/burnlog-mcp  — MCP server for readback
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

| Agent        | Path                                   | Status     |
| ------------ | -------------------------------------- | ---------- |
| Claude Code  | `~/.claude/projects/*/*.jsonl`         | live       |
| OpenAI Codex | `~/.codex/sessions/**/*.jsonl`         | live       |
| Hermes       | `~/.hermes/`                           | stub       |
| openclaw     | `~/.openclaw/`                         | stub       |

For anything not on this list, reach for the SDK.

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs.

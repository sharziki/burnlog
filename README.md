# burnlog

Private leaderboard for AI token burn. Tracks every token you push through Claude
Code (and eventually OpenAI / Google) across projects, and ranks you against
anyone else who points the CLI at their logs.

```
┌─────────────┐   scan ~/.claude   ┌──────────┐   POST /ingest   ┌───────────┐
│  burnlog    │ ─────────────────▶ │  parser  │ ────────────────▶│  web API  │
│     CLI     │                    └──────────┘                  └─────┬─────┘
└─────────────┘                                                        │
                                                                       ▼
                                                                 ┌───────────┐
                                                                 │  SQLite   │
                                                                 └─────┬─────┘
                                                                       │
                                                                       ▼
                                                                 ┌───────────┐
                                                                 │ Next.js UI│
                                                                 └───────────┘
```

## Layout

```
burnlog/
├── web/   # Next.js 15 app router — leaderboard UI, auth, ingest API, SQLite
└── cli/   # TS CLI — parses Claude Code JSONL logs and syncs to web
```

## Quick start

### Web

```bash
cd web
cp .env.example .env        # fill in GitHub OAuth creds (optional for dev)
npm install
npx prisma migrate dev
npm run db:seed -- sharziki "Sharvil Saxena"   # local dev user + API key
npm run dev                 # http://localhost:3000
```

For local-only setup without GitHub OAuth, `npm run db:seed -- <username> "<name>"` now works and prints a usable API key for the CLI.


### CLI

```bash
cd cli
npm install
npm run build
npm link                    # exposes `burnlog` globally

burnlog login <api-key>     # grab key from /settings
burnlog scan                # dry-run — show what would sync
burnlog sync                # upload to web
burnlog status              # show local totals
```

## How it measures burn

The CLI walks `~/.claude/projects/*/*.jsonl` — Claude Code's session logs. Every
assistant message has a `message.usage` block. burnlog sums:

```
input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
```

Dedupes by `requestId` so retries don't double-count. Groups by `cwd` for the
"top projects" column.

## Rank system

| Rank      | Tokens         |
| --------- | -------------- |
| Spark     | 0 – 100K       |
| Ember     | 100K – 500K    |
| Blaze     | 500K – 2M      |
| Inferno   | 2M – 10M       |
| Supernova | 10M+           |

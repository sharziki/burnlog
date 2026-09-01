# Shipping burnlog

The whole workflow is four commands. Everything here exists because something
once went wrong that a build could not catch.

```bash
cd web && npm run preflight     # typecheck + build every package + drift check
git commit && git push          # master auto-deploys to burnlog.net
npm run test:prod               # 56 checks against the live site
npm run test:load               # only before a launch, or after touching a query
```

## The normal change

1. **`npm run preflight`** (from `web/`). Typechecks and builds web, cli, sdk and
   mcp, then runs the cross-package drift check. CI runs most of this too — the
   point of running it locally is that a break costs thirty seconds here and a
   push-wait-fix-push cycle there.
2. **Commit and push to `master`.** Vercel is connected to the GitHub repo, so a
   push to master deploys production on its own. There is nothing to run.
   - Commit as `sharziki@users.noreply.github.com`. Deploys authored by any
     other address come back `BLOCKED` — it is a team-membership refusal that
     does not say so. There are three of them in the deployment history.
3. **`npm run test:prod`.** The GitHub Action runs this on every push and every
   30 minutes anyway, but run it yourself when you are watching a change land.
   It checks the public surface answers, the staged surface still 404s, the
   APIs the CLI depends on are *not* gated, every sitemap URL resolves, and the
   board is not advertising accounts that never synced.

If the deploy needs to happen by hand — Git integration off, or deploying a
branch — it is `cd web && npx vercel@latest deploy --prod`. Use `npx`, never a
global `vercel`: a stale global CLI parks deploys in `UNKNOWN` forever. Put the
token in `VERCEL_TOKEN` rather than passing `--token`, which npm echoes into
your scrollback.

## Before a launch, or after touching a query

**`npm run test:load`.** A build, a typecheck and a smoke test all pass on a
site that falls over when two people arrive at once. This fires 5 concurrent
requests, then 100, at `/`, `/agent` and `/api/leaderboard`, and reports the
slope between them.

Flat is the pass condition, not fast. Under 2× is fine; past 3× means every
visitor is doing work that should have been done once, and the failure just
past the edge of the test is not slowness — it is the 100-connection ceiling on
Postgres, about twenty warm serverless instances away.

This is how the leaderboard fan-out was caught: seven queries per visitor,
0.5s alone and 2.6s at thirty concurrent, with CI green the entire time.

## Publishing a package

Tag it. The release workflows do the rest, and they refuse to publish if the tag
and the `package.json` version disagree.

```bash
git tag cli-v0.7.1 && git push --tags     # or sdk-v… / mcp-v…
```

All three live under `@sxnalabs`. The `@sxna` scope does not exist — every doc
that said `npx -y @sxna/burnlog-mcp` was a 404 for whoever followed it. If you
add a fourth package, it goes under `@sxnalabs` too.

`NPM_TOKEN` is set as a repo secret. If a publish 403s with a message about
2FA, that is npm's way of saying the token cannot write, not that you need a
code.

## The database

Production Postgres is the container `burnlog-pg` on `sxna-runtime-01`. It is
dumped nightly by `sxna-runtime-backup.timer` into `/srv/migration-backups/`,
seven sets kept.

Check it after any change to that host:

```bash
ssh sxna-runtime-01 'ls -la $(ls -1dt /srv/migration-backups/runtime-* | head -1)'
```

`burnlog.dump` must be in there and non-trivial in size. A backup nobody has
restored is not a backup — the restore is: start a throwaway
`postgres:16-alpine`, `pg_restore` the dump into it, and compare
`select count(*) from "BurnEvent"` against production. They matched exactly the
last time it was checked.

The board's entire value is accumulated history. Losing that volume is the one
failure you cannot apologise your way out of, because nobody can re-burn their
tokens.

## If production breaks

- **Read the runtime logs first.** `/` failing in production and working locally
  is almost always auth or the connection pool, and an HTTP probe cannot see
  either. Vercel's runtime logs can.
- **Roll back** from the Vercel dashboard — the previous production deployment
  is one click, and it is faster than a fix under pressure.
- **`npm run test:prod` names the broken thing**, which beats reloading the site
  and guessing.

## What is deliberately not automated

- **Load checks don't run in CI.** Firing 100 concurrent requests at production
  every thirty minutes is not monitoring, it is self-inflicted traffic.
- **The marketing renders are not in the repo.** `marketing/out/` is gitignored;
  `npm run render` regenerates any of them in under a minute.
- **Ingest has no plausibility ceiling.** That is a decision, not an oversight —
  an earlier cap silently deleted real burn from the heaviest users. Gaming is
  answered with attribution, not by discarding data that might be true.

# Deploying burnlog

Production is **burnlog.net** — Next.js on Vercel, Postgres on `sxna-runtime-01`.

## TL;DR

```bash
cd web
npx vercel@latest deploy --prod
```

That's it. Migrations run themselves (see below). Everything else in this file
is context for when something goes wrong.

---

## Topology

| Layer | Where |
| ----- | ----- |
| Web | Vercel project `burnlog` (team `sharzikis-projects`) |
| DNS | Cloudflare NS → A `76.76.21.21` (Vercel anycast) |
| Database | `sxna-runtime-01` (`178.104.203.252`), Docker container `burnlog-pg`, port `55432`, TLS required |

`sxna-apps-01` is **not** involved any more. Its Caddy returns `410` for
burnlog.net and its `burnlog-*` containers are stopped. The `burnlog_burnlog_pgdata`
volume there is a cold backup of the pre-2026-08-11 data, nothing more.

## Deploys are manual

The Vercel project is **not connected to GitHub**, so pushing to `master`
deploys nothing. This is easy to forget and easy to misread as "the deploy is
broken" — it never ran.

Deploy from `web/`, not the repo root: the CLI treats the working directory as
the project root, and the Next.js app lives one level down.

```bash
cd web
npx vercel@latest deploy --prod      # production
npx vercel@latest deploy             # preview URL, same database
```

Use `npx vercel@latest`. A globally-installed Vercel CLI has previously stalled
deploys in `UNKNOWN` state.

### If you'd rather push to deploy

Connect the repo in the Vercel dashboard → Project → Settings → Git, set the
production branch to `master` and the Root Directory to `web`. After that a
push deploys and this file's first section becomes obsolete. It is a dashboard
action; the CLI cannot create the link.

## Migrations run on deploy

`web/package.json` defines a `vercel-build` script, which Vercel prefers over
`build`:

```
prisma generate && prisma migrate deploy && next build
```

So the production schema is applied before the code that needs it, on every
deploy. Local `npm run build` deliberately omits `migrate deploy` so it never
touches a database and works offline.

**Consequence:** a deploy carrying a new migration will apply it to production.
Check `git log --stat` for `web/prisma/migrations/` before deploying if you
want to know in advance.

## Environment

Eight variables live in Vercel (Production). They are the *only* config —
there is no `.env` in production.

```
DATABASE_URL           postgres on runtime-01, sslmode=require, connection_limit=1
AUTH_SECRET            Auth.js signing key
AUTH_GITHUB_ID         OAuth app registered for https://burnlog.net
AUTH_GITHUB_SECRET
AUTH_URL               https://burnlog.net
AUTH_TRUST_HOST        true
NEXT_PUBLIC_SITE_URL   https://burnlog.net
BURNLOG_ADMIN_LOGIN    sharziki
```

Inspect with `npx vercel@latest env ls production`. Values are write-only from
the CLI; the canonical copy of `DATABASE_URL` is `BURNLOG_DATABASE_URL` in
`~/.gbrain/secrets.env`.

**An empty env list is the failure mode that took burnlog.net down.** With no
`AUTH_SECRET`, Auth.js throws `MissingSecret` on *every* request and sign-in
500s. If auth breaks after any project change, check `env ls` first.

## The database

Postgres 16 in Docker on runtime-01. TLS is mandatory: `pg_hba.conf` has only
`hostssl ... scram-sha-256` for `0.0.0.0/0`, so a plaintext external connection
is refused rather than silently downgraded.

```bash
# psql into production
source ~/.gbrain/secrets.env
psql "$BURNLOG_DATABASE_URL"
```

`connection_limit=1` is in the URL on purpose — each serverless instance holds
one connection, so a traffic spike cannot exhaust Postgres's 100-connection
ceiling.

**Do not touch `nova-pg`** on the same host (`127.0.0.1:5433`). Different
container, different volume, that is the brain.

### The firewall rule the site depends on

Postgres must be reachable from the public internet, because that is where
Vercel's functions run. Two traps:

1. **Docker bypasses `INPUT`.** Published ports are DNAT'd and traverse
   `FORWARD` → `DOCKER-USER`. Adding rules to the host's `SXNA-IN-*` chain does
   nothing.
2. **Match the pre-DNAT port.** Docker rewrites `55432` → `5432` before FORWARD
   sees the packet, so `--dport 55432` never matches. Use
   `-m conntrack --ctorigdstport 55432`.

Those chains are in-memory only, so the rule is re-asserted by
`burnlog-db-firewall.service` + `.timer` (every 10 min) on runtime-01. If the
site suddenly cannot reach the database, check that unit before anything else:

```bash
ssh root@100.86.211.91 'systemctl status burnlog-db-firewall.service; iptables -L DOCKER-USER -n | head -4'
```

## Verify a deploy

```bash
curl -o /dev/null -w '%{http_code}\n' https://burnlog.net
curl -s https://burnlog.net/api/leaderboard | head -c 200      # proves the DB is wired
curl -s https://burnlog.net/api/auth/csrf                      # proves AUTH_SECRET is live
```

Auth.js v5 sign-in is **POST-only**. `GET /api/auth/signin/github` returns
`UnknownAction` *by design* — that is not a bug and not a useful health check.
To exercise the real flow, `GET /api/auth/csrf` then POST that token to
`/api/auth/signin/github`; a healthy response is a `302` to
`github.com/login/oauth/authorize`.

## Rollback

Deployments are immutable and previous ones stay promotable:

```bash
npx vercel@latest rollback            # to the previous production deployment
npx vercel@latest ls burnlog          # list, then promote a specific one
```

A rollback does **not** revert database migrations. If a bad deploy migrated
the schema, roll the code back and then fix the schema deliberately.

## Publishing the CLI

Separate from deploying the site — the npm package is what `npx @sxnalabs/burnlog`
installs. See `infra/publishing-sxna-npm-packages` in Nova. Short version:
bump `cli/package.json`, `npm run build`, publish with the read-write token in
`~/.gbrain/secrets.env`.

Keep the published CLI version ahead of what the landing page instructs. The
site tells people to run `npx @sxnalabs/burnlog`; if the registry is behind,
that instruction is a lie.

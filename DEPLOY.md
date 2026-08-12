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

Eight required variables live in Vercel (Production), plus the optional billing
trio in the next section. They are the *only* config — there is no `.env` in
production.

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

## Billing

Three more variables, and they are the only ones in this file that are
optional. The Company tier ($30/mo) is sold through Stripe Checkout.

```
STRIPE_SECRET_KEY      sk_live_… — https://dashboard.stripe.com/apikeys
STRIPE_WEBHOOK_SECRET  whsec_… — signing secret of the endpoint below
STRIPE_PRICE_ID        price_… — the recurring $30/mo Company price
```

**With none of them set the app builds and runs exactly as before**, and the
Company tier is unbilled rather than unavailable: companies work, and
`/companies` says in as many words that billing is off on this deployment.
That is the self-hosting path, and it is deliberate — an unpaid tier that
silently behaves like a paid one is the thing worth avoiding, not a free one
that admits it.

Set all three or none. `STRIPE_SECRET_KEY` without `STRIPE_PRICE_ID` leaves
checkout returning `503 billing_unconfigured`, because there is deliberately no
hardcoded price to fall back to — the tier is sold at whatever `STRIPE_PRICE_ID`
points at, and a constant in the code would keep charging last quarter's number.

### The webhook is the only thing that grants the tier

Point a Stripe endpoint at `https://burnlog.net/api/billing/webhook` and
subscribe it to:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Nothing the browser sends can mark a company as paid. `POST /api/billing/checkout`
hands back a Stripe URL and writes no subscription state; the webhook verifies
the signature against the **raw** request body and is the only writer of
`Company.subscriptionStatus`.

If a payment succeeds but the company still reads "no subscription", the
webhook is the thing to check — the endpoint's delivery log in the Stripe
dashboard will show either a 400 (wrong `STRIPE_WEBHOOK_SECRET`) or a 503
(the key never made it into Vercel).

Locally, `stripe listen --forward-to localhost:3000/api/billing/webhook` prints
a `whsec_…` of its own; that is the value `STRIPE_WEBHOOK_SECRET` needs in dev,
not the dashboard's.

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

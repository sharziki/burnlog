# Security Policy

## Reporting a Vulnerability

Email security issues to security@sxnalabs.com.

Include:

- affected package, route, or deployment target
- steps to reproduce
- impact
- suggested fix, if known

Please do not open public GitHub issues for exploitable vulnerabilities.

## Data We Avoid by Design

burnlog should not ingest or store prompts, completions, file paths, repo names,
working directories, shell output, tool output, or source code. The ingest API
accepts token counts, model/provider/source tags, timestamps, and opaque request
ids only.

## Supported Security Controls

- GitHub OAuth for user login
- hashed API keys
- per-IP and per-key rate limits
- private teams and invite codes
- team API keys with labels and monthly caps
- monthly team budget guard for service ingest
- signed budget webhooks when `BURNLOG_WEBHOOK_SECRET` is set
- audit events for plan, budget/privacy/webhook, and team-key changes
- HTTP security headers for frame blocking, nosniff, referrer policy, and browser permissions
- `/api/health` for deploy monitoring

## Deployment Notes

Set strong values for `AUTH_SECRET`, `BURNLOG_ADMIN_TOKEN`, and
`BURNLOG_WEBHOOK_SECRET`. Keep Postgres private to the app network. Run the web
app behind HTTPS.

## Scope

This policy covers the burnlog web app, CLI, SDK, MCP server, and Docker
deployment files in this repository.

#!/usr/bin/env node
/**
 * Smoke test against a deployed burnlog.
 *
 *   npm run test:prod                      # https://burnlog.net
 *   node scripts/smoke.mjs http://localhost:3000
 *
 * Checks the things a deploy can silently break and a build cannot catch: that
 * the public surface answers, that the staged surface still 404s, that the APIs
 * the CLI depends on are NOT gated, that every URL in the sitemap resolves, and
 * that the board isn't advertising accounts which never synced.
 *
 * Exits non-zero on the first category of failure, and prints every failure —
 * a smoke test that stops at the first one makes you deploy three times to
 * learn three things.
 */
const BASE = (process.argv[2] ?? "https://burnlog.net").replace(/\/$/, "");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

async function get(path, { redirect = "follow" } = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { redirect, headers: { "user-agent": "burnlog-smoke/1" } });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

// --- public surface answers ---
const PUBLIC = [
  "/", "/tools", "/tools/claude-code", "/tools/codex", "/tools/cursor",
  "/tools/gemini-cli", "/tools/aider", "/tools/opencode",
  "/vs/ccusage", "/vs/viberank", "/vs/ccgather",
  "/agent", "/embed", "/privacy", "/security", "/terms", "/settings",
  "/robots.txt", "/sitemap.xml", "/llms.txt", "/agent-setup.md",
];
for (const p of PUBLIC) {
  const { status } = await get(p);
  check(`200 ${p}`, status === 200, `got ${status}`);
}

// --- staged surface stays hidden on a core deployment ---
const { body: robots } = await get("/robots.txt");
const core = robots.includes("Disallow: /challenges");
if (core) {
  for (const p of ["/challenges", "/companies", "/teams", "/c/abc", "/h2h/a-vs-b"]) {
    const { status } = await get(p);
    check(`404 ${p}`, status === 404, `got ${status}`);
  }
} else {
  check("surface", true, "full-surface deployment — staged routes not checked");
}

// --- the APIs the CLI and MCP drive must NOT be gated ---
for (const p of ["/api/leaderboard", "/api/health", "/api/auth/csrf", "/api/clubs", "/api/challenges"]) {
  const { status } = await get(p);
  check(`api ${p}`, status === 200, `got ${status} — the CLI breaks if this 404s`);
}

// --- share surfaces ---
for (const p of ["/widget.js", "/og", "/favicon.svg", "/manifest.json"]) {
  const { status, body } = await get(p);
  check(`asset ${p}`, status === 200 && body.length > 100, `got ${status}, ${body.length}b`);
}

// --- sitemap is honest: every URL in it resolves ---
const { body: sitemap } = await get("/sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("sitemap: not empty", locs.length > 0, `${locs.length} urls`);
check("sitemap: no staged urls", !/\/(challenges|companies|teams|h2h)\b/.test(sitemap) || !core);
const broken = [];
for (const loc of locs) {
  const { status } = await get(loc);
  if (status !== 200) broken.push(`${loc}=${status}`);
}
check("sitemap: every URL 200", broken.length === 0, broken.join("; "));

// --- content the deploy could quietly regress ---
const { body: home } = await get("/");
check("home: says Clubs, not Teams", !home.includes(">Teams<"));
check("home: copy-prompt onboarding rendered", home.includes("Copy prompt for Claude Code"));
check("home: canonical present", home.includes('rel="canonical"'));
check(
  "home: no unsynced accounts on the board",
  !home.includes("awaiting first burn"),
  "the world board is showing signups who never synced",
);

const { body: leaderboardBody } = await get("/api/leaderboard");
const publicUsername = JSON.parse(leaderboardBody).users?.[0]?.username;
if (publicUsername) {
  const { body: publicProfile } = await get(`/u/${encodeURIComponent(publicUsername)}`);
  check(
    "profile: visitor cannot see another account's embed controls",
    !publicProfile.includes("EMBED BADGE") && !publicProfile.includes("![burnlog]("),
  );
}

// --- the sign-in door actually opens ---
// A 200 on /api/auth/csrf only proves Auth.js is mounted. Sign-in was broken
// for every visitor for days while that check stayed green, so this drives the
// real handshake: mint a CSRF token, POST it, and confirm the redirect lands on
// GitHub with this deployment's own callback URL. It cannot see a failure on
// the way *back* from GitHub — only runtime logs can, which is why the
// [auth][error] watcher exists alongside this.
{
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "burnlog-smoke/1" } });
  const cookie = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = await csrfRes.json();
  check("auth: csrf token issued", Boolean(csrfToken));

  const signin = await fetch(`${BASE}/api/auth/signin/github`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      "user-agent": "burnlog-smoke/1",
    },
    body: new URLSearchParams({ csrfToken }),
  });
  const location = signin.headers.get("location") ?? "";
  check("auth: sign-in redirects to GitHub", location.startsWith("https://github.com/login/oauth/authorize"), location.slice(0, 80));
  check(
    "auth: callback URL points back at this deployment",
    location.includes(encodeURIComponent(`${BASE}/api/auth/callback/github`)),
    "redirect_uri does not match the site — GitHub will reject the sign-in",
  );
  check("auth: PKCE requested", location.includes("code_challenge="));
}

// --- nothing is slow enough to be broken ---
// A one-connection Prisma pool plus a query that loaded every row put the
// profile page at 8-10s and made server components time out mid-navigation,
// which surfaced to visitors as "a client-side exception has occurred". Best of
// three, so a cold start alone can't fail the run.
{
  const BUDGET_MS = 4000;
  const board = JSON.parse((await get("/api/leaderboard")).body);
  const someone = board.users?.[0]?.username;
  const paths = ["/", "/api/leaderboard", ...(someone ? [`/u/${encodeURIComponent(someone)}`] : [])];
  for (const path of paths) {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await get(path);
      best = Math.min(best, Date.now() - t0);
    }
    check(`speed ${path} < ${BUDGET_MS}ms`, best < BUDGET_MS, `best of 3 was ${best}ms`);
  }
}

// --- escapes that only fail once rendered ---
// A JSX attribute string does not process escapes, so mark="\u2212" shipped to
// production as six literal characters. Nothing in typecheck or build objects.
for (const path of ["/", "/privacy", "/security"]) {
  const { body } = await get(path);
  // Script blocks are excluded on purpose: Next serialises its RSC payload with
  // \u0026 for every ampersand, so scanning the whole document only ever finds
  // the framework's own escaping. The bug this guards against showed up in
  // rendered markup, which is what's left after the scripts come out.
  const markup = body.replace(/<script[\s\S]*?<\/script>/g, "");
  const literal = markup.match(/\\u[0-9a-fA-F]{4}/g);
  check(`render ${path}: no literal \\uXXXX escapes`, !literal, literal ? `found ${[...new Set(literal)].join(", ")}` : "");
}

const { body: agent } = await get("/agent-setup.md");
for (const token of ["burnlog login", "burnlog sync", "burnlog wrap", "requestId"]) {
  check(`agent-setup: ${token}`, agent.includes(token));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${BASE}\n`);
for (const f of failed) console.log(`  FAIL  ${f.name}${f.detail ? `  — ${f.detail}` : ""}`);
if (failed.length) process.exitCode = 1;
else console.log("  all green");

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Point everything — config, hooks, every adapter — at an empty temp HOME.
// Scrub the rest of the environment so no BURNLOG_*_DIR / XDG_* / tool-home
// override leaks a real log directory into the scan. This must happen before
// config.ts is imported: it resolves ~/.burnlog at module load.
const HOME = mkdtempSync(join(tmpdir(), "bl-connect-"));
const KEEP = new Set(["PATH", "TMPDIR", "TEMP", "TMP", "SystemRoot"]);
for (const k of Object.keys(process.env)) if (!KEEP.has(k)) delete process.env[k];
Object.assign(process.env, {
  HOME,
  BURNLOG_NO_SCHEDULE: "1",
  USERPROFILE: HOME,
  XDG_DATA_HOME: join(HOME, ".local", "share"),
  XDG_CONFIG_HOME: join(HOME, ".config"),
  XDG_STATE_HOME: join(HOME, ".local", "state"),
  XDG_CACHE_HOME: join(HOME, ".cache"),
  BURNLOG_API_URL: "https://burnlog.test",
  NO_COLOR: "1",
});

let connect: typeof import("./connect.js").connect;
before(async () => {
  ({ connect } = await import("./connect.js"));
});

const API = "https://burnlog.test";
const CODE = "blc_" + "ab12".repeat(10);
const CONFIG = join(HOME, ".burnlog", "config.json");
const SETTINGS = join(HOME, ".claude", "settings.json");

type Call = { url: string; body?: unknown };
let calls: Call[] = [];
let redeemReply: { status: number; body: unknown } = { status: 200, body: { key: "blg_testkey", username: "sharziki" } };

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ url, body });
  const json = (status: number, b: unknown) =>
    new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url === `${API}/api/connect/redeem`) return json(redeemReply.status, redeemReply.body);
  if (url === `${API}/api/ingest`) {
    const n = (body as { events: unknown[] }).events.length;
    return json(200, { ok: true, inserted: n, skipped: 0 });
  }
  if (url === `${API}/api/me/rank`) {
    return json(200, {
      ok: true, username: "sharziki", rank: "Ember", rankIcon: "*", totalTokens: 1, position: 1, totalUsers: 3,
    });
  }
  return json(404, { error: "not found" });
}) as typeof fetch;

async function run(args: string[]): Promise<{ out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  console.error = (...a: unknown[]) => void err.push(a.join(" "));
  try {
    await connect(args);
  } finally {
    console.log = log;
    console.error = error;
  }
  return { out, err };
}

function claudeLog(): void {
  const dir = join(HOME, ".claude", "projects", "demo");
  mkdirSync(dir, { recursive: true });
  const line = (id: string, input: number, output: number) =>
    JSON.stringify({
      type: "assistant",
      requestId: id,
      timestamp: "2026-09-01T12:00:00.000Z",
      message: { id, model: "claude-opus-4", usage: { input_tokens: input, output_tokens: output } },
    });
  writeFileSync(join(dir, "s.jsonl"), [line("req_1", 1000, 500), line("req_2", 2000, 1500)].join("\n") + "\n");
}

beforeEach(() => {
  for (const f of readdirSync(HOME)) rmSync(join(HOME, f), { recursive: true, force: true });
  calls = [];
  redeemReply = { status: 200, body: { key: "blg_testkey", username: "sharziki" } };
  process.exitCode = 0;
});

test("connect: redeems, saves the key, full-syncs, installs auto-sync, prints relayable lines", async () => {
  claudeLog();
  const { out, err } = await run([CODE]);

  assert.deepEqual(err, []);
  assert.equal(process.exitCode, 0);
  const redeem = calls.find((c) => c.url.endsWith("/api/connect/redeem"));
  assert.equal((redeem?.body as { code: string }).code, CODE);
  assert.ok((redeem?.body as { label?: string }).label!.length <= 40);

  const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  assert.equal(cfg.apiKey, "blg_testkey");
  assert.ok(cfg.lastSync, "lastSync recorded");
  assert.ok(cfg.backfilled.includes("claude-code"), "claude-code marked backfilled");
  assert.equal(cfg.apiUrl, undefined, "env api url not persisted");

  const ingested = calls.filter((c) => c.url.endsWith("/api/ingest")).flatMap((c) => (c.body as { events: unknown[] }).events);
  assert.equal(ingested.length, 2);

  assert.match(readFileSync(SETTINGS, "utf8"), /burnlog sync --quiet/);

  assert.deepEqual(out, [
    "✓ connected as @sharziki",
    "✓ synced 2 events from claude-code (5.0K tokens)",
    "✓ auto-sync on (when a Claude Code session ends)",
    `→ #1 of 3 · ${API}/u/sharziki`,
  ]);
});

test("connect: a malformed code fails before any network call", async () => {
  const { out, err } = await run(["blc_nothex"]);
  assert.equal(calls.length, 0);
  assert.equal(process.exitCode, 1);
  assert.deepEqual(out, []);
  assert.match(err.join("\n"), /doesn't look like a burnlog setup code/);
  assert.equal(existsSync(CONFIG), false);
  process.exitCode = 0;
});

test("connect: expired code (410) says so and saves nothing", async () => {
  redeemReply = { status: 410, body: { error: "expired_code" } };
  const { out, err } = await run([CODE]);
  assert.equal(process.exitCode, 1);
  assert.deepEqual(out, []);
  assert.deepEqual(err, [`✗ that setup code has expired — copy a fresh prompt from ${API}`]);
  assert.equal(calls.length, 1);
  assert.equal(existsSync(CONFIG), false);
  process.exitCode = 0;
});

test("connect: invalid code (400) is reported as invalid", async () => {
  redeemReply = { status: 400, body: { error: "invalid_code" } };
  const { err } = await run([CODE]);
  assert.equal(process.exitCode, 1);
  assert.match(err.join("\n"), /isn't valid/);
  process.exitCode = 0;
});

test("connect: zero events still succeeds", async () => {
  mkdirSync(join(HOME, ".claude")); // Claude Code installed, never run
  const { out, err } = await run([CODE]);
  assert.deepEqual(err, []);
  assert.equal(process.exitCode, 0);
  assert.equal(calls.filter((c) => c.url.endsWith("/api/ingest")).length, 0);
  assert.equal(JSON.parse(readFileSync(CONFIG, "utf8")).apiKey, "blg_testkey");
  assert.deepEqual(out, [
    "✓ connected as @sharziki",
    "✓ no agent usage found yet — it will sync after your next session",
    "✓ auto-sync on (when a Claude Code session ends)",
    `→ #1 of 3 · ${API}/u/sharziki`,
  ]);
});

test("connect: with no hook and no schedule, says auto-sync is off instead of failing", async () => {
  const { out } = await run([CODE]);
  assert.equal(process.exitCode, 0);
  assert.equal(existsSync(SETTINGS), false);
  assert.match(out[1], /no agent usage found yet — run `npx -y @sxnalabs\/burnlog sync` after your next session/);
  assert.match(out[2], /^! auto-sync not installed: disabled by BURNLOG_NO_SCHEDULE/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GooseAdapter } from "./goose.js";

const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? "NULL" : String(v));

type R = {
  id: string;
  cfg: string | null;
  created: string;
  provider?: string;
  tot?: number | null;
  inp?: number | null;
  out?: number | null;
  atot?: number | null;
  ainp?: number | null;
  aout?: number | null;
};

function gooseDb(rows: R[]): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-goose-"));
  const sql = [
    `CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, working_dir TEXT, description TEXT,
       created_at TEXT, model_config_json TEXT, provider_name TEXT,
       total_tokens INTEGER, input_tokens INTEGER, output_tokens INTEGER,
       accumulated_total_tokens INTEGER, accumulated_input_tokens INTEGER, accumulated_output_tokens INTEGER);`,
    ...rows.map(
      (r) =>
        `INSERT INTO sessions VALUES (${q(r.id)}, 'secret title', '/home/me/secret', 'secret', ${q(r.created)}, ${q(r.cfg)}, ${q(r.provider ?? "anthropic")}, ${n(r.tot ?? null)}, ${n(r.inp ?? null)}, ${n(r.out ?? null)}, ${n(r.atot ?? null)}, ${n(r.ainp ?? null)}, ${n(r.aout ?? null)});`,
    ),
  ].join("\n");
  execFileSync("sqlite3", [join(dir, "sessions.db"), sql]);
  return dir;
}

async function scan(dir: string) {
  process.env.BURNLOG_GOOSE_DIR = dir;
  return new GooseAdapter().scan();
}

const cfg = (m: string) => JSON.stringify({ model_name: m, context_limit: 200000 });

test("goose: accumulated totals win; total-gap counts as reasoning (output)", async () => {
  const dir = gooseDb([
    { id: "20260414_1", cfg: cfg("claude-sonnet-4-20250514"), created: "2026-04-14 16:18:53", tot: 50, inp: 30, out: 20, atot: 1600, ainp: 1000, aout: 500 },
  ]);
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.requestId, "20260414_1");
  assert.equal(e.model, "claude-sonnet-4-20250514");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 1000);
  assert.equal(e.outputTokens, 600);
  assert.equal(e.cacheReadTokens, 0);
  // `YYYY-MM-DD HH:MM:SS` is UTC.
  assert.equal(e.timestamp, "2026-04-14T16:18:53.000Z");
});

test("goose: falls back to per-turn columns; skips empty/invalid model config and zero usage", async () => {
  const dir = gooseDb([
    { id: "a", cfg: cfg("gpt-5"), created: "2026-04-14T16:18:53Z", provider: "openai", tot: 15, inp: 10, out: 5 },
    { id: "b", cfg: cfg("  "), created: "2026-04-14", inp: 10, out: 5 },
    { id: "c", cfg: "not json", created: "2026-04-14", inp: 10, out: 5 },
    { id: "d", cfg: null, created: "2026-04-14", inp: 10, out: 5 },
    { id: "e", cfg: cfg("gpt-5"), created: "2026-04-14", inp: 0, out: 0, tot: 0 },
    { id: "f", cfg: cfg("gemini-2.5-pro"), created: "2026-04-14", provider: "ollama", inp: 3, out: 4 },
  ]);
  const r = await scan(dir);
  assert.deepEqual(r.events.map((e) => e.requestId).sort(), ["a", "f"]);
  const a = r.events.find((e) => e.requestId === "a")!;
  assert.equal(a.inputTokens, 10);
  assert.equal(a.outputTokens, 5);
  assert.equal(a.timestamp, "2026-04-14T16:18:53.000Z");
  const f = r.events.find((e) => e.requestId === "f")!;
  assert.equal(f.timestamp, "2026-04-14T00:00:00.000Z");
  assert.equal(f.provider, "google");
});

test("goose: not installed", async () => {
  const r = await scan(join(tmpdir(), "bl-goose-none"));
  assert.equal(r.note, "not installed");
});

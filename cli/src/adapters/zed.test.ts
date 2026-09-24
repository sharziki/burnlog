import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync } from "fs";
import * as zlib from "zlib";
import { tmpdir } from "os";
import { join } from "path";
import { ZedAdapter, decodeThread } from "./zed.js";

const zstdCompress = (zlib as unknown as { zstdCompressSync?: (b: Buffer) => Buffer }).zstdCompressSync;

function makeDb(withCreatedAt = true): { dir: string; db: string } {
  const dir = mkdtempSync(join(tmpdir(), "bl-zed-"));
  mkdirSync(join(dir, "threads"));
  const db = join(dir, "threads", "threads.db");
  const extra = withCreatedAt ? ", parent_id TEXT, folder_paths TEXT, folder_paths_order TEXT, created_at TEXT" : "";
  execFileSync("sqlite3", [
    db,
    `CREATE TABLE threads (id TEXT PRIMARY KEY, summary TEXT NOT NULL, updated_at TEXT NOT NULL, data_type TEXT NOT NULL, data BLOB NOT NULL${extra});`,
  ]);
  return { dir, db };
}

function insert(db: string, id: string, json: object, dataType: "json" | "zstd", updatedAt: string, createdAt?: string) {
  const raw = Buffer.from(JSON.stringify(json));
  const data = dataType === "zstd" ? zstdCompress!(raw) : raw;
  const cols = createdAt ? "id, summary, updated_at, data_type, data, created_at" : "id, summary, updated_at, data_type, data";
  const vals = `'${id}', 'secret title', '${updatedAt}', '${dataType}', X'${data.toString("hex")}'${createdAt ? `, '${createdAt}'` : ""}`;
  execFileSync("sqlite3", [db, `INSERT INTO threads (${cols}) VALUES (${vals});`]);
}

function thread(provider: string, model: string, req: unknown): object {
  return {
    version: "0.3.0",
    title: "Test thread",
    messages: [{ role: "user", content: "PROMPT TEXT" }],
    updated_at: "2026-05-01T12:30:00Z",
    request_token_usage: req,
    cumulative_token_usage: { input_tokens: 999, output_tokens: 999 },
    model: { provider, model },
    imported: false,
  };
}

async function scan(dir: string) {
  process.env.BURNLOG_ZED_DIR = dir;
  try {
    return await new ZedAdapter().scan();
  } finally {
    delete process.env.BURNLOG_ZED_DIR;
  }
}

test("zed: zstd hosted thread sums per-request usage", { skip: !zstdCompress }, async () => {
  const { dir, db } = makeDb();
  insert(
    db,
    "thread-1",
    thread("zed.dev", "claude-sonnet-4-5", {
      "user-1": { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 10 },
      "user-2": { input_tokens: 50, output_tokens: 7 },
    }),
    "zstd",
    "2026-05-01T12:30:00Z",
    "2026-05-01T12:00:00Z",
  );
  const r = await scan(dir);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "claude-sonnet-4-5");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.inputTokens, 150);
  assert.equal(e.outputTokens, 27);
  assert.equal(e.cacheCreationTokens, 5);
  assert.equal(e.cacheReadTokens, 10);
  assert.equal(e.timestamp, "2026-05-01T12:00:00.000Z");
  assert.doesNotMatch(e.requestId, /thread-1/);
  assert.equal(JSON.stringify(r).includes("PROMPT"), false);
});

test("zed: non-hosted threads are skipped", async () => {
  const { dir, db } = makeDb();
  insert(db, "t", thread("anthropic", "claude-sonnet-4-5", { a: { input_tokens: 100, output_tokens: 20 } }), "json", "2026-05-01T12:30:00Z");
  assert.equal((await scan(dir)).events.length, 0);
});

test("zed: imported threads are skipped", async () => {
  const { dir, db } = makeDb();
  insert(db, "t", { ...thread("zed.dev", "gpt-5.2", { a: { input_tokens: 1, output_tokens: 1 } }), imported: true }, "json", "2026-05-01T12:30:00Z");
  assert.equal((await scan(dir)).events.length, 0);
});

test("zed: cumulative usage is the fallback", async () => {
  const { dir, db } = makeDb();
  insert(
    db,
    "t",
    {
      ...thread("zed.dev", "gpt-5.2", {}),
      cumulative_token_usage: { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: 2, cache_read_input_tokens: 4 },
    },
    "json",
    "2026-05-01T12:30:00Z",
  );
  const [e] = (await scan(dir)).events;
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheCreationTokens, e.cacheReadTokens], [12, 3, 2, 4]);
  assert.equal(e.provider, "openai");
});

test("zed: pre-created_at schema dates by updated_at", { skip: !zstdCompress }, async () => {
  const { dir, db } = makeDb(false);
  insert(db, "t", thread("zed.dev", "gpt-5.2", { a: { input_tokens: 12, output_tokens: 3 } }), "zstd", "2026-05-01T12:30:00Z");
  const [e] = (await scan(dir)).events;
  assert.equal(e.timestamp, "2026-05-01T12:30:00.000Z");
});

test("zed: unknown data_type is rejected", () => {
  assert.equal(decodeThread("brotli", Buffer.from("{}")), null);
});

test("zed: missing db reports not installed", async () => {
  const r = await scan(mkdtempSync(join(tmpdir(), "bl-zed-none-")));
  assert.equal(r.note, "not installed");
});

test("zed: since skips an untouched db", async () => {
  const { dir, db } = makeDb();
  insert(db, "t", thread("zed.dev", "gpt-5.2", { a: { input_tokens: 1, output_tokens: 1 } }), "json", "2026-05-01T12:30:00Z");
  process.env.BURNLOG_ZED_DIR = dir;
  try {
    const r = await new ZedAdapter().scan({ since: new Date(Date.now() + 3_600_000) });
    assert.equal(r.events.length, 0);
  } finally {
    delete process.env.BURNLOG_ZED_DIR;
  }
});

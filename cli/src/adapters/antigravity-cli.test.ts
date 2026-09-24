import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AntigravityCliAdapter, inferredEpochMs, parseAntigravityDb } from "./antigravity-cli.js";

// --- tiny protobuf encoder (mirrors tokscale's test helpers) ---
function varint(v: bigint): number[] {
  const out: number[] = [];
  for (;;) {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) b |= 0x80;
    out.push(b);
    if (v === 0n) return out;
  }
}
const encV = (field: number, v: number | bigint) => [...varint(BigInt(field) << 3n), ...varint(BigInt(v))];
const encL = (field: number, payload: number[] | string) => {
  const bytes = typeof payload === "string" ? [...Buffer.from(payload)] : payload;
  return [...varint((BigInt(field) << 3n) | 2n), ...varint(BigInt(bytes.length)), ...bytes];
};
const hex = (b: number[]) => Buffer.from(b).toString("hex");

function row(model: string | null, display: string | null, responseId: string, gen9?: number[]): number[] {
  const usage = [...encV(1, 1132), ...encV(2, 500), ...encV(5, 16000), ...encV(9, 300), ...encV(10, 40), ...encL(11, responseId)];
  const chat = [...encL(4, usage)];
  if (gen9) chat.push(...encL(9, gen9));
  if (model) chat.push(...encL(19, model));
  if (display) chat.push(...encL(21, display));
  return encL(1, chat);
}

function trajectoryMeta(seconds = 1_781_502_653): number[] {
  return [...encL(1, encL(1, "file:///C:/Users/Frank/obsidian-vault")), ...encL(2, [...encV(1, seconds), ...encV(2, 0)])];
}

function home(): string {
  return mkdtempSync(join(tmpdir(), "bl-agy-"));
}

function writeConversation(dir: string, name: string, blobs: number[][], meta?: number[], steps?: number[][]): string {
  mkdirSync(dir, { recursive: true });
  const db = join(dir, name);
  const sql = [
    "CREATE TABLE gen_metadata (idx integer, data blob, size integer);",
    ...blobs.map((b, i) => `INSERT INTO gen_metadata VALUES (${i}, X'${hex(b)}', 0);`),
  ];
  if (meta) sql.push("CREATE TABLE trajectory_metadata_blob (id text, data blob);", `INSERT INTO trajectory_metadata_blob VALUES ('main', X'${hex(meta)}');`);
  if (steps) {
    sql.push("CREATE TABLE steps (idx integer, step_type integer, metadata blob);");
    steps.forEach((s, i) => sql.push(`INSERT INTO steps VALUES (${i + 1}, 15, X'${hex(s)}');`));
  }
  execFileSync("sqlite3", [db, sql.join("\n")]);
  return db;
}

async function scan(root: string) {
  process.env.BURNLOG_ANTIGRAVITY_CLI_DIR = root;
  try {
    return await new AntigravityCliAdapter().scan();
  } finally {
    delete process.env.BURNLOG_ANTIGRAVITY_CLI_DIR;
  }
}

test("antigravity-cli: parses tokens, aliased model and session created-at", async () => {
  const root = home();
  writeConversation(join(root, "antigravity-cli", "conversations"), "session-test.db", [row("gemini-3-flash-a", null, "resp-1")], trajectoryMeta());
  const r = await scan(root);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "gemini-3.5-flash-high");
  assert.equal(e.provider, "google");
  assert.equal(e.inputTokens, 1632); // 1132 + 500
  assert.equal(e.cacheReadTokens, 16000);
  assert.equal(e.outputTokens, 340); // 300 output + 40 thinking
  assert.equal(e.requestId, "resp-1");
  assert.equal(e.timestamp, new Date(1_781_502_653_000).toISOString());
  assert.equal(JSON.stringify(r).includes("obsidian"), false);
});

test("antigravity-cli: IDE-extension dbs are read and shared response ids count once", async () => {
  const root = home();
  writeConversation(join(root, "antigravity-cli", "conversations"), "a.db", [row("gemini-3-flash-a", null, "resp-1")], trajectoryMeta());
  writeConversation(join(root, "antigravity", "conversations"), "b.db", [row("gemini-3-flash-a", null, "resp-1"), row("gemini-3-flash-a", null, "resp-2")], trajectoryMeta());
  const r = await scan(root);
  assert.deepEqual(r.events.map((e) => e.requestId).sort(), ["resp-1", "resp-2"]);
});

test("antigravity-cli: missing #19 is recovered from a sibling row's display label", async () => {
  const root = home();
  const db = writeConversation(join(root, "antigravity-cli", "conversations"), "s.db", [
    row(null, "Gemini 3.1 Pro (High)", "r1"),
    row("gemini-pro-default", "Gemini 3.1 Pro (High)", "r2"),
  ]);
  const u = await parseAntigravityDb(db);
  assert.deepEqual(u.map((x) => x.model), ["gemini-3.1-pro", "gemini-3.1-pro"]);
});

test("antigravity-cli: an unidentified label is not guessed; routing label resolves from its display label", async () => {
  const root = home();
  const db = writeConversation(join(root, "antigravity-cli", "conversations"), "s.db", [
    row("gemini-3-flash-a", "Gemini 3.5 Flash (High)", "r1"),
    row(null, "Mystery Model", "r2"),
    row("gemini-default", "Gemini 3.5 Flash (Medium)", "r3"),
  ]);
  const u = await parseAntigravityDb(db);
  assert.deepEqual(u.map((x) => x.model), ["gemini-3.5-flash-high", "unknown", "gemini-3.5-flash-medium"]);
});

test("antigravity-cli: dedupes repeated response ids and skips zero usage", async () => {
  const root = home();
  const zero = encL(1, [...encL(4, encL(11, "z")), ...encL(19, "gemini-3-flash-a")]);
  const db = writeConversation(join(root, "antigravity-cli", "conversations"), "s.db", [row("m", null, "r1"), row("m", null, "r1"), zero]);
  assert.equal((await parseAntigravityDb(db)).length, 1);
});

test("antigravity-cli: per-generation #9.#4 timestamp overrides session created-at", async () => {
  const root = home();
  const gen9 = encL(4, [...encV(1, 1_789_000_000), ...encV(2, 500_000_000)]);
  const db = writeConversation(join(root, "antigravity-cli", "conversations"), "s.db", [row("m", null, "r1", gen9)], trajectoryMeta());
  assert.equal((await parseAntigravityDb(db))[0].timestamp, 1_789_000_000_500);
});

test("antigravity-cli: steps table dates modern agy turns by response id", async () => {
  const root = home();
  const cacheMeta = encL(10, "cache metadata payload that is not a timestamp");
  const step = (sec: number, rid: string) => [...encL(1, [...encV(1, sec), ...encV(2, 0)]), ...encL(9, encL(11, rid))];
  const db = writeConversation(
    join(root, "antigravity-cli", "conversations"),
    "s.db",
    [row("m", null, "resp-step-1", cacheMeta), row("m", null, "resp-step-2", cacheMeta)],
    trajectoryMeta(),
    [step(1_789_200_000, "resp-step-1"), step(1_789_217_157, "resp-step-2")],
  );
  const u = await parseAntigravityDb(db);
  assert.deepEqual(u.map((x) => x.timestamp), [1_789_200_000_000, 1_789_217_157_000]);
});

test("antigravity-cli: inferred 1.1.18 stamps need an anchor and must fall in the session window", () => {
  const now = 1_790_000_000_000;
  const anchor = now - 86_400_000;
  const le = Buffer.alloc(8);
  le.writeBigUInt64LE(BigInt(anchor + 60_000));
  assert.equal(inferredEpochMs(le, anchor, now), anchor + 60_000);
  assert.equal(inferredEpochMs(le, undefined, now), undefined);
  const early = Buffer.alloc(8);
  early.writeBigUInt64LE(BigInt(anchor - 10 * 86_400_000));
  assert.equal(inferredEpochMs(early, anchor, now), undefined);
});

test("antigravity-cli: malformed blobs and overlarge varints never throw", async () => {
  const root = home();
  const huge = encL(1, [...encL(4, [...encV(1, (1n << 64n) - 1n), ...encV(2, 10), ...encV(9, (1n << 64n) - 1n), ...encL(11, "o")]), ...encL(19, "m")]);
  const db = writeConversation(join(root, "antigravity-cli", "conversations"), "s.db", [[0xff, 0xff, 0xff], huge]);
  const u = await parseAntigravityDb(db);
  assert.equal(u.length, 1);
  assert.ok(u[0].input > 0 && Number.isSafeInteger(u[0].input));
});

test("antigravity-cli: .pb-only installs are explained, not counted", async () => {
  const root = home();
  mkdirSync(join(root, "antigravity", "conversations"), { recursive: true });
  writeFileSync(join(root, "antigravity", "conversations", "x.pb"), "enc");
  const r = await scan(root);
  assert.equal(r.events.length, 0);
  assert.match(r.note ?? "", /encrypted \.pb/);
});

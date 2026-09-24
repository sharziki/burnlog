import { readdirSync, statSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { querySqlite, SqliteUnavailable } from "./sqlite.js";
import { envDir, hashId, isDir } from "./fileutil.js";

/**
 * Antigravity CLI (and IDE-extension) adapter — ported from tokscale's
 * `sessions/antigravity_cli.rs` (MIT).
 *
 * Every conversation is its own SQLite file:
 *
 *   <gemini home>/antigravity-cli/conversations/<uuid>.db   (CLI, `agy`)
 *   ~/.gemini/antigravity/conversations/<uuid>.db           (IDE extensions)
 *
 * `<gemini home>` is `$GEMINI_CLI_HOME`, else `~/.gemini`, on every platform.
 * Both surfaces write the same format; they are read together and a response
 * id seen on one is not counted again on the other. (Older IDE builds write
 * encrypted `.pb` files there instead; those are not readable and are skipped.)
 *
 * `gen_metadata.data` is one generation as a `GeneratorMetadata` protobuf. No
 * schema ships, so a tiny wire-format reader pulls the few fields tokscale
 * reverse-engineered:
 *
 *   #1 chatModel
 *     #19 responseModel (machine id)     #21 display label
 *     #9  per-generation time (#4 Timestamp on agy <= 1.1.17, #10 on 1.1.18)
 *     #4  usage: #1 fixed system prompt + #2 new input = input,
 *               #5 cache read, #9 output, #10 thinking, #11 responseId
 *
 * Output here is #9 + #10 (tokscale keeps thinking in its own bucket; burnlog
 * counts it as output, and #9 + #10 == the model's total output).
 *
 * Only the `data`/`metadata` blobs are selected. The workspace URI in
 * `trajectory_metadata_blob.#1` is never decoded; only its created-at (#2).
 *
 * Override the gemini home with BURNLOG_ANTIGRAVITY_CLI_DIR (both
 * `antigravity-cli/conversations` and `antigravity/conversations` beneath it
 * are read).
 */

// ---------------------------------------------------------------------------
// Protobuf wire reader (no schema).
// ---------------------------------------------------------------------------

type Wire =
  | { t: "varint"; v: bigint }
  | { t: "len"; v: Uint8Array }
  | { t: "fixed64"; v: bigint }
  | { t: "fixed32" };

const U64_MAX = (1n << 64n) - 1n;
const I64_MAX = (1n << 63n) - 1n;

function* fields(buf: Uint8Array): Generator<[number, Wire]> {
  let pos = 0;
  const varint = (): bigint | null => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (pos >= buf.length) return null;
      const byte = buf[pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result & U64_MAX;
      shift += 7n;
      if (shift >= 64n) return null;
    }
  };
  while (pos < buf.length) {
    const tag = varint();
    if (tag === null) return;
    const field = Number(tag >> 3n);
    switch (Number(tag & 7n)) {
      case 0: {
        const v = varint();
        if (v === null) return;
        yield [field, { t: "varint", v }];
        break;
      }
      case 1: {
        if (pos + 8 > buf.length) return;
        let v = 0n;
        for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(buf[pos + i]);
        pos += 8;
        yield [field, { t: "fixed64", v }];
        break;
      }
      case 2: {
        const len = varint();
        if (len === null || pos + Number(len) > buf.length) return;
        const v = buf.subarray(pos, pos + Number(len));
        pos += Number(len);
        yield [field, { t: "len", v }];
        break;
      }
      case 5:
        if (pos + 4 > buf.length) return;
        pos += 4;
        yield [field, { t: "fixed32" }];
        break;
      default:
        return; // groups / garbage: stop rather than desync
    }
  }
}

export function messageField(buf: Uint8Array, field: number): Uint8Array | undefined {
  for (const [f, w] of fields(buf)) if (f === field && w.t === "len") return w.v;
  return undefined;
}

export function varintField(buf: Uint8Array, field: number): bigint | undefined {
  for (const [f, w] of fields(buf)) if (f === field && w.t === "varint") return w.v;
  return undefined;
}

function fixed64Field(buf: Uint8Array, field: number): bigint | undefined {
  for (const [f, w] of fields(buf)) if (f === field && w.t === "fixed64") return w.v;
  return undefined;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function stringField(buf: Uint8Array, field: number): string | undefined {
  const bytes = messageField(buf, field);
  if (!bytes) return undefined;
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

function nonEmpty(buf: Uint8Array, field: number): string | undefined {
  const s = stringField(buf, field);
  return s !== undefined && s.trim() !== "" ? s : undefined;
}

/** u64 varint → safe JS token count (clamped like tokscale's i64 saturation). */
function tokens(v: bigint | undefined): number {
  if (v === undefined) return 0;
  const clamped = v > I64_MAX ? I64_MAX : v;
  return clamped > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(clamped);
}

// ---------------------------------------------------------------------------
// Timestamps.
// ---------------------------------------------------------------------------

/** `{#1: seconds, #2: nanos}` → epoch ms; malformed → undefined. */
function protoTimestampMs(ts: Uint8Array): number | undefined {
  const seconds = varintField(ts, 1);
  if (seconds === undefined) return undefined;
  const nanos = varintField(ts, 2) ?? 0n;
  if (nanos > 999_999_999n) return undefined;
  const secs = BigInt.asIntN(64, seconds); // tokscale reads it `as i64`
  const ms = secs * 1000n + nanos / 1_000_000n;
  if (ms > I64_MAX || ms < -I64_MAX) return undefined;
  return Number(ms);
}

const MIN_PLAUSIBLE_MS = 1_577_836_800_000; // 2020-01-01
const MAX_PLAUSIBLE_MS = 4_102_444_800_000; // 2100-01-01
const plausible = (ms: number): boolean => ms >= MIN_PLAUSIBLE_MS && ms <= MAX_PLAUSIBLE_MS;
const HOUR = 3_600_000;

/** Unit detection by magnitude: 0 = s, 1 = ms, 2 = µs, 3 = ns. */
function epochWithUnit(value: bigint): [number, number] | undefined {
  if (value === U64_MAX || value > I64_MAX) return undefined;
  const candidates: Array<[number, bigint]> = [
    [0, value * 1000n],
    [1, value],
    [2, value / 1000n],
    [3, value / 1_000_000n],
  ];
  for (const [unit, ms] of candidates) {
    if (ms > I64_MAX) continue;
    const n = Number(ms);
    if (plausible(n)) return [unit, n];
  }
  return undefined;
}

/**
 * agy 1.1.18 moved the per-generation stamp into 8 opaque bytes at `#9.#10`.
 * tokscale only accepts a reading that lands inside the session's own
 * lifetime, and declines outright without a decoded session created-at.
 */
export function inferredEpochMs(payload: Uint8Array, anchor: number | undefined, nowMs = Date.now()): number | undefined {
  if (anchor === undefined || anchor <= 0) return undefined;
  const earliest = anchor - HOUR;
  const latest = nowMs + HOUR;
  const ok = (ms: number): boolean => ms >= earliest && ms <= latest;

  const nested = protoTimestampMs(payload);
  if (nested !== undefined && plausible(nested) && ok(nested)) return nested;
  const v1 = varintField(payload, 1);
  const v1ms = v1 !== undefined ? epochWithUnit(v1)?.[1] : undefined;
  if (v1ms !== undefined && ok(v1ms)) return v1ms;
  const f1 = fixed64Field(payload, 1);
  const f1ms = f1 !== undefined ? epochWithUnit(f1)?.[1] : undefined;
  if (f1ms !== undefined && ok(f1ms)) return f1ms;

  if (payload.length !== 8) return undefined;
  let le = 0n;
  let be = 0n;
  for (let i = 7; i >= 0; i--) le = (le << 8n) | BigInt(payload[i]);
  for (let i = 0; i < 8; i++) be = (be << 8n) | BigInt(payload[i]);
  const l = epochWithUnit(le);
  const b = epochWithUnit(be);
  let settled: number | undefined;
  if (l && b) {
    if (l[1] === b[1]) settled = l[1];
    else if (b[0] > l[0]) settled = l[1]; // BE only reads in a finer unit: LE's mirror
    else settled = undefined; // genuinely ambiguous
  } else settled = l?.[1] ?? b?.[1];
  return settled !== undefined && ok(settled) ? settled : undefined;
}

function generationTimestampMs(gen: Uint8Array, anchor: number | undefined): number | undefined {
  const ts = messageField(gen, 4);
  const explicit = ts ? protoTimestampMs(ts) : undefined;
  if (explicit !== undefined && explicit > 0) return explicit;
  const payload = messageField(gen, 10);
  return payload ? inferredEpochMs(payload, anchor) : undefined;
}

// ---------------------------------------------------------------------------
// Models.
// ---------------------------------------------------------------------------

/**
 * The slice of tokscale's pricing alias table that Antigravity emits:
 * placeholder ids and response-model machine ids → the real model name.
 */
const ALIASES: Record<string, string> = {
  model_placeholder_m26: "claude-opus-4-6",
  model_placeholder_m35: "claude-sonnet-4-6",
  model_placeholder_m36: "gemini-3.1-pro",
  model_placeholder_m37: "gemini-3.1-pro",
  model_placeholder_m16: "gemini-3.1-pro",
  model_placeholder_m18: "gemini-3-flash-preview",
  model_placeholder_m84: "gemini-3-flash-preview",
  model_placeholder_m132: "gemini-3.5-flash-high",
  model_placeholder_m133: "gemini-3.5-flash-high",
  model_placeholder_m187: "gemini-3.5-flash-extra-low",
  model_placeholder_m20: "gemini-3.5-flash-medium",
  model_placeholder_m47: "gemini-3-flash-preview",
  model_openai_gpt_oss_120b_medium: "gpt-oss-120b-medium",
  "gemini-pro-default": "gemini-3.1-pro",
  "gemini-pro-agent": "gemini-3.1-pro",
  "gemini-3-flash-agent": "gemini-3.5-flash-high",
  "gemini-3-flash-b": "gemini-3.5-flash-high",
  "gemini-3-flash-a": "gemini-3.5-flash-high",
  "gemini-3-flash-c": "gemini-3-flash-preview",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3.5-flash-low": "gemini-3.5-flash-medium",
  "gemini-3.1-pro-high": "gemini-3.1-pro",
  "gemini-3.1-pro-low": "gemini-3.1-pro",
  "gemini-3-pro-high": "gemini-3-pro",
  "gemini-3-pro-low": "gemini-3-pro",
  "claude-opus-4-6-thinking": "claude-opus-4-6",
  "claude-sonnet-4-6-thinking": "claude-sonnet-4-6",
  "claude-opus-4.6-thinking": "claude-opus-4-6",
  "claude-sonnet-4.6-thinking": "claude-sonnet-4-6",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-haiku-4.6": "claude-haiku-4-6",
};

export function resolveAntigravityModel(model: string): string {
  return ALIASES[model.toLowerCase()] ?? model;
}

const isRoutingLabel = (m: string): boolean => m.trim().toLowerCase() === "gemini-default";

function displayLabelToModel(label: string): string | undefined {
  switch (label.trim()) {
    case "Gemini 3.5 Flash (Low)":
      return "gemini-3.5-flash-extra-low";
    case "Gemini 3.5 Flash (Medium)":
      return "gemini-3.5-flash-medium";
    case "Gemini 3.5 Flash (High)":
      return "gemini-3.5-flash-high";
    default:
      return undefined;
  }
}

/** Model attribution recovered from the whole conversation for rows lacking #19. */
class SessionModels {
  private byDisplay = new Map<string, string>();
  private sole: string | undefined;

  constructor(blobs: Uint8Array[]) {
    const byDisplay = new Map<string, string | null>();
    const distinct = new Set<string>();
    const unresolved: string[] = [];
    for (const blob of blobs) {
      const chat = messageField(blob, 1);
      if (!chat) continue;
      const label = nonEmpty(chat, 21);
      const model = nonEmpty(chat, 19);
      if (!model || isRoutingLabel(model)) {
        if (label) unresolved.push(label);
        continue;
      }
      distinct.add(model);
      if (label === undefined) continue;
      if (!byDisplay.has(label)) byDisplay.set(label, model);
      else {
        const existing = byDisplay.get(label);
        if (existing && existing !== model && resolveAntigravityModel(existing) !== resolveAntigravityModel(model)) {
          byDisplay.set(label, null);
        }
      }
    }
    for (const [label, model] of byDisplay) if (model) this.byDisplay.set(label, model);
    const allIdentified = unresolved.every((l) => this.byDisplay.has(l));
    if (distinct.size === 1 && allIdentified) this.sole = [...distinct][0];
  }

  recover(chat: Uint8Array): string | undefined {
    const label = nonEmpty(chat, 21);
    return label !== undefined ? this.byDisplay.get(label) : this.sole;
  }
}

// ---------------------------------------------------------------------------
// Database read.
// ---------------------------------------------------------------------------

type Usage = {
  responseId?: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  timestamp: number;
};

function hexBytes(v: unknown): Uint8Array | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return Uint8Array.from(Buffer.from(v, "hex"));
}

async function tryQuery(db: string, sql: string): Promise<Record<string, unknown>[]> {
  try {
    return await querySqlite(db, sql);
  } catch (err) {
    if (err instanceof SqliteUnavailable) throw err;
    return []; // missing table: not this kind of database / older layout
  }
}

function fileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Newest write to a database, counting its WAL (where live writes land). */
export function dbMtime(path: string): number {
  return Math.max(fileMtime(path), fileMtime(`${path}-wal`));
}

/**
 * Parse one conversation database into usage rows (tokscale's
 * `parse_antigravity_db_file`). Repeated response ids within the file are
 * dropped; the caller dedupes across files.
 */
export async function parseAntigravityDb(path: string): Promise<Usage[]> {
  const metaRows = await tryQuery(path, "SELECT hex(data) AS h FROM trajectory_metadata_blob LIMIT 1");
  const metaBlob = hexBytes(metaRows[0]?.h);
  let createdMs: number | undefined;
  if (metaBlob) {
    const created = messageField(metaBlob, 2);
    const ms = created ? protoTimestampMs(created) : undefined;
    if (ms !== undefined && ms > 0) createdMs = ms;
  }
  const fallbackMs = createdMs ?? Math.floor(fileMtime(path));

  const byResponse = new Map<string, number>();
  const byGenIdx = new Map<number, number>();
  for (const row of await tryQuery(
    path,
    "SELECT hex(metadata) AS h FROM steps WHERE step_type = 15 AND metadata IS NOT NULL",
  )) {
    const blob = hexBytes(row.h);
    if (!blob) continue;
    const ts = messageField(blob, 1);
    const ms = ts ? protoTimestampMs(ts) : undefined;
    if (ms === undefined || ms <= 0) continue;
    const m9 = messageField(blob, 9);
    const rid = m9 ? stringField(m9, 11)?.trim() : undefined;
    if (rid) byResponse.set(rid, ms);
    const m20 = messageField(blob, 20);
    const idx = m20 ? varintField(m20, 3) : undefined;
    if (idx !== undefined && idx <= I64_MAX) byGenIdx.set(Number(idx), ms);
  }

  const rows: Array<{ idx: number | null; blob: Uint8Array }> = [];
  for (const row of await tryQuery(path, "SELECT idx, hex(data) AS h FROM gen_metadata ORDER BY idx")) {
    const blob = hexBytes(row.h);
    if (!blob) continue;
    rows.push({ idx: typeof row.idx === "number" ? row.idx : row.idx == null ? null : Number(row.idx), blob });
  }
  const models = new SessionModels(rows.map((r) => r.blob));

  const seen = new Set<string>();
  const out: Usage[] = [];
  for (const { idx, blob } of rows) {
    const chat = messageField(blob, 1);
    const usage = chat ? messageField(chat, 4) : undefined;
    if (!chat || !usage) continue;

    const input = Math.min(Number.MAX_SAFE_INTEGER, tokens(varintField(usage, 1)) + tokens(varintField(usage, 2)));
    const cacheRead = tokens(varintField(usage, 5));
    const text = tokens(varintField(usage, 9));
    const thinking = tokens(varintField(usage, 10));
    if (input === 0 && text === 0 && cacheRead === 0 && thinking === 0) continue;

    const rid = stringField(usage, 11);
    const responseId = rid !== undefined && rid.trim() !== "" ? rid : undefined;
    if (responseId !== undefined) {
      if (seen.has(responseId)) continue;
      seen.add(responseId);
    }

    const gen = messageField(chat, 9);
    const timestamp =
      (gen ? generationTimestampMs(gen, createdMs) : undefined) ??
      (responseId !== undefined ? byResponse.get(responseId) : undefined) ??
      (idx !== null ? byGenIdx.get(idx) : undefined) ??
      fallbackMs;

    const responseModel = nonEmpty(chat, 19);
    const label = nonEmpty(chat, 21);
    const raw =
      (responseModel && !isRoutingLabel(responseModel) ? responseModel : undefined) ??
      models.recover(chat) ??
      (label !== undefined ? displayLabelToModel(label) : undefined) ??
      responseModel ??
      "unknown";

    out.push({
      responseId,
      model: resolveAntigravityModel(raw),
      input,
      output: Math.min(Number.MAX_SAFE_INTEGER, text + thinking),
      cacheRead,
      timestamp,
    });
  }
  return out;
}

function conversationDirs(): string[] {
  const explicit = envDir("BURNLOG_ANTIGRAVITY_CLI_DIR");
  if (explicit) {
    return [join(explicit, "antigravity-cli", "conversations"), join(explicit, "antigravity", "conversations")];
  }
  const geminiHome = envDir("GEMINI_CLI_HOME") ?? join(homedir(), ".gemini");
  const dirs = [
    join(geminiHome, "antigravity-cli", "conversations"),
    // IDE extension surface: home-rooted in tokscale, not GEMINI_CLI_HOME.
    join(homedir(), ".gemini", "antigravity", "conversations"),
  ];
  return [...new Set(dirs)];
}

export class AntigravityCliAdapter implements Adapter {
  readonly name = "antigravity-cli" as const;

  private dirs(): string[] {
    return conversationDirs().filter(isDir);
  }

  detect(): boolean {
    return this.dirs().some((d) => {
      try {
        return readdirSync(d).some((f) => f.endsWith(".db"));
      } catch {
        return false;
      }
    });
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const dirs = this.dirs();
    const files: string[] = [];
    let unreadable = 0;
    for (const d of dirs) {
      let names: string[] = [];
      try {
        names = readdirSync(d);
      } catch {
        continue;
      }
      for (const n of names) {
        if (n.endsWith(".db")) files.push(join(d, n));
        else if (n.endsWith(".pb")) unreadable++;
      }
    }
    if (files.length === 0) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note:
          dirs.length === 0
            ? "not installed"
            : unreadable > 0
              ? `installed, but only ${unreadable} encrypted .pb conversation(s) (older Antigravity) — no readable .db usage`
              : "installed, but no conversations yet",
      };
    }

    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    try {
      for (const file of files) {
        if (!shouldRead(dbMtime(file), opts.since)) continue;
        scannedFiles++;
        const stem = basename(file, ".db");
        const usages = await parseAntigravityDb(file);
        totalLines += usages.length;
        usages.forEach((u, i) => {
          // responseId is a server-issued opaque id; without one, hash so the
          // conversation file name never leaves the machine.
          const requestId = u.responseId ?? hashId("antigravity", stem, i, u.timestamp);
          if (byId.has(requestId)) return; // same response on the other surface
          byId.set(requestId, {
            requestId,
            source: this.name,
            model: u.model,
            provider: providerFromModel(u.model),
            inputTokens: u.input,
            outputTokens: u.output,
            cacheCreationTokens: 0,
            cacheReadTokens: u.cacheRead,
            timestamp: new Date(u.timestamp).toISOString(),
          });
        });
      }
    } catch (err) {
      if (err instanceof SqliteUnavailable) {
        return { source: this.name, events: [], scannedFiles, totalLines, note: `detected, but ${err.message}` };
      }
      throw err;
    }
    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines };
  }
}

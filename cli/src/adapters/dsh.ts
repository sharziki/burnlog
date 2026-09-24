import { readFileSync, statSync, existsSync } from "fs";
import { basename, dirname } from "path";
import * as zlib from "zlib";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, envOrHome, hashId, num, walkFiles } from "./fileutil.js";

/**
 * DeepSeek Harness (DSH) — ported from tokscale's `sessions/dsh.rs`.
 *
 * DSH writes one JSONL transcript per session at any depth under
 *
 *   <DSH_HOME>/sessions/<encoded-cwd>/<session-id>/session.jsonl.zstd
 *
 * (`DSH_HOME` defaults to `~/.dsh`). The `.zstd` suffix is only the encoding:
 * `compression: none` writes the same rows to a plain `session.jsonl`, and
 * newer builds version the name (`session.v<N>.jsonl[.zstd]`). We sniff the
 * zstd frame magic rather than trusting the name.
 *
 * Rows that carry usage: `assistant/message` (`data.usage`, or the last
 * `usage` chunk of `data.stream`), `assistant/attempt` (stream only) and
 * `compaction/summary` (`data.usage`). DSH's input is already uncached, cache
 * reads/writes are separate, and `reasoningTokens` is a SUBSET of
 * `outputTokens` — so output is reported as-is, never output + reasoning.
 *
 * Dedupe follows tokscale exactly: forks copy the parent's prefix verbatim
 * (skipped via `seedLength`), a later settlement for the same (turn, step)
 * replaces the earlier one unless `llm/retry-started` closed that slot, and
 * a content key collapses identical rows within and across files.
 *
 * A live session appends one zstd frame per flush, so a scan can see a torn
 * trailing frame; the decodable prefix is kept. Decoding needs Node's
 * built-in zstd (22.15+); on older Node the compressed logs are skipped and
 * the note says so.
 *
 * Override the sessions root with BURNLOG_DSH_DIR.
 */

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** Same 64 MiB ceilings tokscale uses for the read and the decode. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

type Json = Record<string, unknown>;

function sessionsRoot(): string {
  return envDir("BURNLOG_DSH_DIR") ?? `${envOrHome("DSH_HOME", ".dsh")}/sessions`;
}

/** tokscale's `dsh-session-log` pattern. */
export function isDshSessionLog(name: string): boolean {
  const base = name.endsWith(".zstd") ? name.slice(0, -5) : name;
  if (base === "session.jsonl") return true;
  const m = /^session\.v(\d+)\.jsonl$/.exec(base);
  return m !== null;
}

function zstdAvailable(): boolean {
  return typeof (zlib as unknown as { createZstdDecompress?: unknown }).createZstdDecompress === "function";
}

/**
 * Split a buffer of concatenated zstd frames at frame boundaries, reading
 * only frame and block headers (RFC 8878 §3.1). Returns the complete frames
 * and whatever trailing bytes do not form one (a torn final frame).
 *
 * Needed because Node's zstd decoder stops after the FIRST frame, and DSH
 * appends one frame per flush.
 */
export function splitZstdFrames(buf: Buffer): { frames: Buffer[]; rest: Buffer } {
  const frames: Buffer[] = [];
  let pos = 0;
  while (pos + 4 <= buf.length) {
    const magic = buf.readUInt32LE(pos);
    let p = pos + 4;
    if ((magic & 0xfffffff0) === 0x184d2a50) {
      // Skippable frame: 4-byte size, then opaque data.
      if (p + 4 > buf.length) break;
      const end = p + 4 + buf.readUInt32LE(p);
      if (end > buf.length) break;
      pos = end;
      continue;
    }
    if (magic !== 0xfd2fb528) break;
    if (p >= buf.length) break;
    const fhd = buf[p++];
    const fcsFlag = fhd >> 6;
    const singleSegment = (fhd >> 5) & 1;
    const checksum = (fhd >> 2) & 1;
    const dictFlag = fhd & 3;
    p += singleSegment ? 0 : 1;
    p += [0, 1, 2, 4][dictFlag];
    p += fcsFlag === 0 ? singleSegment : [0, 2, 4, 8][fcsFlag];
    let last = false;
    let ok = true;
    while (!last) {
      if (p + 3 > buf.length) {
        ok = false;
        break;
      }
      const h = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
      p += 3;
      last = (h & 1) === 1;
      const type = (h >> 1) & 3;
      const size = h >>> 3;
      if (type === 3) {
        ok = false;
        break;
      }
      p += type === 1 ? 1 : size;
    }
    if (checksum) p += 4;
    if (!ok || p > buf.length) break;
    frames.push(buf.subarray(pos, p));
    pos = p;
  }
  return { frames, rest: buf.subarray(pos) };
}

type ZstdApi = {
  zstdDecompressSync: (b: Buffer, o?: { maxOutputLength?: number }) => Buffer;
  createZstdDecompress: () => NodeJS.ReadWriteStream & { destroy(): void };
};

/** Whatever prefix of a (possibly truncated) single frame decodes. */
function decodePartialFrame(raw: Buffer, limit: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    };
    const d = (zlib as unknown as ZstdApi).createZstdDecompress();
    d.on("data", (c: Buffer) => {
      if (done) return;
      if (size + c.length > limit) {
        d.destroy();
        finish();
        return;
      }
      size += c.length;
      chunks.push(c);
    });
    d.on("end", finish);
    d.on("error", finish);
    d.end(raw);
  });
}

/**
 * Decode a DSH zstd transcript: every complete frame, plus the decodable
 * prefix of a torn trailing one (DSH's own reader does the same). Returns
 * null when the output would pass the decoded ceiling.
 */
async function decodeZstdPrefix(raw: Buffer): Promise<Buffer | null> {
  const api = zlib as unknown as ZstdApi;
  const { frames, rest } = splitZstdFrames(raw);
  const out: Buffer[] = [];
  let size = 0;
  for (const frame of frames) {
    let d: Buffer;
    try {
      d = api.zstdDecompressSync(frame, { maxOutputLength: MAX_DECODED_BYTES - size + 1 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") return null;
      // A corrupt frame ends the readable prefix.
      return Buffer.concat(out);
    }
    size += d.length;
    if (size > MAX_DECODED_BYTES) return null;
    out.push(d);
  }
  if (rest.length > 0) {
    const tail = await decodePartialFrame(rest, MAX_DECODED_BYTES - size);
    out.push(tail);
  }
  return Buffer.concat(out);
}

async function readSession(path: string): Promise<string | null> {
  let raw: Buffer;
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    raw = readFileSync(path);
  } catch {
    return null;
  }
  if (raw.length >= 4 && raw.subarray(0, 4).equals(ZSTD_MAGIC)) {
    if (!zstdAvailable()) return null;
    const decoded = await decodeZstdPrefix(raw);
    return decoded ? decoded.toString("utf8") : null;
  }
  if (raw.length > MAX_DECODED_BYTES) return null;
  return raw.toString("utf8");
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

function get(v: unknown, ...path: string[]): unknown {
  let cur = v;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

function lastStreamUsage(value: Json): unknown {
  const stream = get(value, "data", "stream");
  if (!Array.isArray(stream)) return undefined;
  for (let i = stream.length - 1; i >= 0; i--) {
    const rec = stream[i] as Json | null;
    const chunk = rec?.chunk as Json | undefined;
    if (rec?.type === "chunk" && chunk?.type === "usage" && chunk.usage !== undefined) return chunk.usage;
  }
  return undefined;
}

function usageForEvent(value: Json, type: string): unknown {
  if (type === "assistant/message") return get(value, "data", "usage") ?? lastStreamUsage(value);
  if (type === "assistant/attempt") return lastStreamUsage(value);
  if (type === "compaction/summary") return get(value, "data", "usage");
  return undefined;
}

/** The concrete model that served the call (responseModel beats source.model). */
export function servedModel(source: unknown): string | undefined {
  return str(get(source, "replayState", "response", "responseModel")) ?? str(get(source, "model"));
}

/** A parsed DSH call, with tokscale's additive buckets. */
export type DshCall = {
  key: string;
  sessionId: string;
  model: string;
  provider: string;
  timestamp: number;
  input: number;
  /** Output with reasoning removed (tokscale's additive `output`). */
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

/** Port of `parse_dsh_file` over already-decoded transcript text. */
export function parseDshTranscript(text: string, folderSessionId: string): DshCall[] {
  let sessionId: string | undefined;
  let seedLength = 0;
  let fallbackProvider: string | undefined;
  let fallbackModel: string | undefined;
  const out: DshCall[] = [];
  const seen = new Set<string>();
  let lastSettlement: { turn: number; step: number; index: number } | null = null;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let value: Json;
    try {
      value = JSON.parse(line) as Json;
    } catch {
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const type = value.type;
    if (typeof type !== "string") continue;

    if (type === "session") {
      sessionId = typeof value.id === "string" ? value.id : undefined;
      const sl = int(value.seedLength);
      seedLength = sl !== undefined && sl > 0 ? sl : 0;
    } else if (type === "request/header") {
      const config = get(value, "data", "header", "config");
      const p = get(config, "provider");
      fallbackProvider = typeof p === "string" ? p : undefined;
      fallbackModel = str(get(config, "model"));
    } else if (type === "llm/retry-started") {
      const rt = int(get(value, "data", "turn"));
      const rs = int(get(value, "data", "step"));
      if (lastSettlement && lastSettlement.turn === rt && lastSettlement.step === rs) lastSettlement = null;
    } else if (type === "assistant/message" || type === "assistant/attempt" || type === "compaction/summary") {
      const isSummary = type === "compaction/summary";
      const isAttempt = type === "assistant/attempt";
      const seq = int(value.seq);
      if (seedLength > 0 && seq !== undefined && seq < seedLength) continue;

      const usage = usageForEvent(value, type);
      if (usage === undefined || usage === null || typeof usage !== "object") continue;
      const u = usage as Json;
      const outputRaw = num(u.outputTokens);
      const reasoning = num(u.reasoningTokens);
      const input = num(u.inputTokens);
      const output = Math.max(0, outputRaw - reasoning);
      const cacheRead = num(u.cacheReadTokens);
      const cacheWrite = num(u.cacheWriteTokens);
      if (input + output + cacheRead + cacheWrite + reasoning === 0) continue;

      const timestamp = int(value.time);
      if (timestamp === undefined || timestamp <= 0) continue;

      const source = get(value, "data", "message", "source");
      const model = servedModel(source) ?? fallbackModel ?? "unknown";
      const sp = get(source, "provider");
      const provider = (typeof sp === "string" ? sp : undefined) ?? fallbackProvider ?? "unknown";
      const sid = sessionId ?? folderSessionId;

      let identity: string;
      if (isAttempt) {
        const aid = str(get(value, "data", "attemptId")) ?? str(get(value, "data", "retryId"));
        const turn = int(get(value, "data", "turn"));
        const step = int(get(value, "data", "step"));
        identity = aid
          ? `attempt-id:${aid}`
          : seq !== undefined
            ? `attempt-session:${sid}:seq:${seq}`
            : turn !== undefined && step !== undefined
              ? `attempt-session:${sid}:turn:${turn}:step:${step}:${timestamp}`
              : `attempt-session:${sid}`;
      } else {
        const mid = str(get(value, "data", "message", "id"));
        const cid = isSummary ? str(get(value, "data", "compactionId")) : undefined;
        identity = mid
          ? `msg:${mid}`
          : cid
            ? `cmp:${cid}`
            : seq !== undefined
              ? `seq:${seq}`
              : `sid:${sid}`;
      }
      const kind = isSummary ? "summary:" : isAttempt ? "attempt:" : "";
      const key =
        `dsh:${kind}${identity}:${timestamp}:${provider}:${model}:` +
        `${input}:${output}:${cacheRead}:${cacheWrite}:${reasoning}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const call: DshCall = {
        key,
        sessionId: sid,
        model,
        provider,
        timestamp,
        input,
        output,
        reasoning,
        cacheRead,
        cacheWrite,
      };
      if (isSummary) {
        out.push(call);
        continue;
      }
      const turn = int(get(value, "data", "turn"));
      const step = int(get(value, "data", "step"));
      if (turn !== undefined && step !== undefined) {
        if (lastSettlement && lastSettlement.turn === turn && lastSettlement.step === step) {
          // Another sample for the same attempt slot: latest wins.
          out[lastSettlement.index] = call;
          continue;
        }
        out.push(call);
        lastSettlement = { turn, step, index: out.length - 1 };
      } else {
        out.push(call);
        lastSettlement = null;
      }
    }
  }
  return out;
}

function mapProvider(provider: string, model: string): BurnEvent["provider"] {
  const p = provider.toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google") return p;
  return providerFromModel(model);
}

export class DshAdapter implements Adapter {
  readonly name = "dsh" as const;

  detect(): boolean {
    return existsSync(sessionsRoot());
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const root = sessionsRoot();
    if (!existsSync(root)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = walkFiles(root, isDshSessionLog).sort();
    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    let skippedZstd = 0;

    for (const file of files) {
      try {
        if (!shouldRead(statSync(file).mtimeMs, opts.since)) continue;
      } catch {
        continue;
      }
      const text = await readSession(file);
      if (text === null) {
        if (file.endsWith(".zstd") && !zstdAvailable()) skippedZstd++;
        continue;
      }
      scannedFiles++;
      totalLines += text.split("\n").length;

      const folder = basename(dirname(file)).trim() || "unknown";
      for (const c of parseDshTranscript(text, folder)) {
        // Cross-file pass: identical keys (a fork's copied rows) collapse.
        const requestId = hashId("dsh", c.key);
        if (byKey.has(requestId)) continue;
        byKey.set(requestId, {
          requestId,
          source: this.name,
          model: c.model,
          provider: mapProvider(c.provider, c.model),
          inputTokens: c.input,
          // Reasoning is a subset of DSH's outputTokens: add back what the
          // additive split removed, never double it.
          outputTokens: c.output + c.reasoning,
          cacheCreationTokens: c.cacheWrite,
          cacheReadTokens: c.cacheRead,
          timestamp: new Date(c.timestamp).toISOString(),
        });
      }
    }

    return {
      source: this.name,
      events: [...byKey.values()],
      scannedFiles,
      totalLines,
      ...(skippedZstd > 0
        ? { note: `skipped ${skippedZstd} zstd-compressed session(s): needs Node 22.15+ for built-in zstd` }
        : {}),
    };
  }
}

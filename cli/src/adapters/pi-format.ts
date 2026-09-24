import { homedir } from "os";
import type { Adapter, AdapterName, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import {
  type Buckets,
  EventSet,
  collectFiles,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  opaqueId,
  notInstalled,
  obj,
  parseJson,
  parseRfc3339,
  readLines,
  str,
} from "./jsonl-kit.js";

/**
 * The Pi session format (badlogic/pi-mono), shared by every Pi descendant:
 * Pi, Oh My Pi (omp), Kimchi, Senpi and Prime Agent. Port of tokscale's
 * `sessions/pi.rs`.
 *
 * One JSONL file per session. The first record is the header (a `title`
 * record may precede it in newer omp builds):
 *
 *   {"type":"session","id":"<session>","cwd":"...","parentSession":?,"rlmDepth":?}
 *
 * Assistant turns carry the usage this reads:
 *
 *   {"type":"message","id":"<entry>","timestamp":"<rfc3339>",
 *    "message":{"role":"assistant","model":"...","provider":"...","responseId":?,
 *               "usage":{"input","output","cacheRead","cacheWrite","totalTokens","reasoning"}}}
 *
 * `input` is cache-exclusive and `reasoning` is a SUBSET of `output` (Pi's own
 * totalTokens = input + output + cacheRead + cacheWrite), so reasoning is
 * never added on top.
 *
 * A header that does not parse, or any other record type before the header,
 * makes the whole file foreign and it is skipped — tokscale's rule.
 *
 * Dedupe: Pi/omp/senpi/prime fork a session by copying earlier assistant
 * records into a new file, so their key is session-independent
 * (`responseId`, else entry id + immutable fields). Kimchi keeps the older
 * session-scoped key `<session>:<entry id>`.
 */

export type PiLane = "standard" | "standard-deduped" | "prime";

type PiUsage = Record<string, unknown>;

export type PiHeader = {
  id: string;
  cwd?: string;
  parentSession?: string;
  rlmDepth: number;
};

export type PiMessage = {
  /** Source dedupe key (unhashed). */
  key: string;
  entryId?: string;
  model: string;
  provider: BurnEvent["provider"];
  tokens: Buckets;
  /** Recorded timestamp, if the record had a valid one. */
  recordedMs?: number;
  /** Recorded timestamp or the file's mtime. */
  timestampMs: number;
};

export type PiAttribution = {
  id: string;
  targetId: string;
  timestampMs?: number;
  childUsage: Buckets;
  aggregateUsage: Buckets;
};

export type PiFile = {
  header: PiHeader;
  messages: PiMessage[];
  /** Prime Agent `child_usage_attributed` records (never emitted themselves). */
  attributions: PiAttribution[];
  lines: number;
};

const REPLACEMENT = "�";
const hasReplacement = (s: string): boolean => s.includes(REPLACEMENT);

/**
 * Could a key containing U+FFFD be a damaged spelling of `expected`? Port of
 * tokscale's `damaged_key_may_name`: a replacement char inside the key may
 * stand for any run of characters; at either edge it must consume at least
 * one, so an intact key with a damaged extension is not mistaken for it.
 */
export function damagedKeyMayName(key: string, expected: string): boolean {
  if (!hasReplacement(key)) return false;
  const p = [...key];
  const e = [...expected];
  const m: boolean[][] = Array.from({ length: p.length + 1 }, () => new Array(e.length + 1).fill(false));
  m[0][0] = true;
  for (let pi = 0; pi < p.length; pi++) {
    for (let ei = 0; ei <= e.length; ei++) {
      if (!m[pi][ei]) continue;
      if (p[pi] === REPLACEMENT) {
        const min = pi > 0 && pi + 1 < p.length ? ei : ei + 1;
        for (let k = min; k <= e.length; k++) m[pi + 1][k] = true;
      } else if (ei < e.length && p[pi] === e[ei]) {
        m[pi + 1][ei + 1] = true;
      }
    }
  }
  return m[p.length][e.length];
}

const COUNTER_KEYS = ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "reasoning"];

function usageHasDamagedKey(u: PiUsage): boolean {
  return Object.keys(u).some((k) => COUNTER_KEYS.some((c) => damagedKeyMayName(k, c)));
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function piBuckets(u: PiUsage): Buckets {
  return { input: n(u.input), output: n(u.output), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) };
}

/** Parse one Pi-format file. Null when the file is not a Pi transcript. */
export function parsePiFile(file: string, client: string, lane: PiLane): PiFile | null {
  const lossy = lane === "prime";
  const crossSession = lane !== "standard";
  const fallbackMs = mtimeMs(file);
  // Standard lanes keep tokscale's byte-strict reading: a record that was not
  // valid UTF-8 is dropped rather than read through its replacement chars.
  const lines = readLines(file, !lossy);
  const ok = (s: string | undefined): s is string => s !== undefined && (!lossy || !hasReplacement(s));

  let header: PiHeader | null = null;
  const messages: PiMessage[] = [];
  const attributions: PiAttribution[] = [];

  for (const line of lines) {
    const rec = parseJson(line);

    if (!header) {
      if (!rec || typeof rec.type !== "string") {
        if (lossy && hasReplacement(line)) continue;
        return null;
      }
      if (rec.type !== "session") {
        if (rec.type === "title") continue;
        return null;
      }
      const id = str(rec.id);
      if (id === undefined) return null;
      const rlmDepth = typeof rec.rlmDepth === "number" ? rec.rlmDepth : 0;
      const parent = str(rec.parentSession);
      if (lossy) {
        const invalidLineage = rlmDepth > 0 && (!parent || !parent.trim() || hasReplacement(parent));
        const damagedKey = Object.keys(rec).some(
          (k) => damagedKeyMayName(k, "parentSession") || damagedKeyMayName(k, "rlmDepth"),
        );
        if (invalidLineage || damagedKey) return null;
      }
      header = {
        // A damaged session id is replaced by a per-file placeholder upstream;
        // the session id only feeds kimchi's session-scoped key, so any stable
        // stand-in works here.
        id: ok(id) ? id : `unknown:${file}`,
        cwd: str(rec.cwd),
        parentSession: parent,
        rlmDepth,
      };
      continue;
    }

    if (!rec || typeof rec.type !== "string") continue;
    const entryTs = str(rec.timestamp);

    if (rec.type === "child_usage_attributed") {
      const id = str(rec.id);
      const targetId = str(rec.targetId);
      const child = obj(rec.childUsage);
      const aggregate = obj(rec.aggregateUsage);
      if (id && targetId && child && aggregate) {
        if (hasReplacement(id) || hasReplacement(targetId) || usageHasDamagedKey(child) || usageHasDamagedKey(aggregate))
          continue;
        attributions.push({
          id,
          targetId,
          timestampMs: entryTs !== undefined ? parseRfc3339(entryTs) : undefined,
          childUsage: piBuckets(child),
          aggregateUsage: piBuckets(aggregate),
        });
      }
      continue;
    }

    if (rec.type !== "message") continue;
    const msg = obj(rec.message);
    if (!msg || msg.role !== "assistant") continue;

    // An RLM child's completion timestamp is the join key for Prime's
    // accounting; a damaged one would count both child and parent aggregate.
    if (lossy && header.rlmDepth > 0) {
      const damagedTsKey = Object.keys(rec).some((k) => damagedKeyMayName(k, "timestamp"));
      if (damagedTsKey || (entryTs !== undefined && (hasReplacement(entryTs) || parseRfc3339(entryTs) === undefined)))
        continue;
    }

    const usage = obj(msg.usage);
    if (!usage) continue;
    if (lossy && usageHasDamagedKey(usage)) continue;
    const recordedModel = str(msg.model);
    if (recordedModel === undefined) continue;

    const model = ok(recordedModel) ? recordedModel : "unknown";
    const rawProvider = str(msg.provider);
    const provider = mapProvider(rawProvider && ok(rawProvider) ? rawProvider : undefined, model);
    const tokens = piBuckets(usage);
    const recordedMs = entryTs !== undefined ? parseRfc3339(entryTs) : undefined;
    const entryId = str(rec.id);
    const cleanEntryId = entryId && entryId.trim() && ok(entryId) ? entryId : undefined;

    let key: string | undefined;
    if (crossSession) {
      const responseId = str(msg.responseId);
      if (responseId && responseId.trim() && ok(responseId)) {
        key = `${client}:response:${responseId}`;
      } else if (cleanEntryId) {
        key = [
          `${client}:message:${cleanEntryId}`,
          recordedMs ?? "missing",
          rawProvider ?? "",
          model,
          tokens.input,
          tokens.output,
          tokens.cacheRead,
          tokens.cacheWrite,
        ].join(":");
      } else if (lossy) {
        key = `${client}:damaged:${opaqueId(line)}`;
      }
    } else if (entryId && entryId.trim()) {
      key = `${client}:${header.id}:${entryId}`;
    }
    // No stable id at all: position within the session keeps it unique.
    key ??= `${client}:${header.id}:line:${messages.length}:${recordedMs ?? "missing"}`;

    messages.push({
      key,
      entryId: cleanEntryId,
      model,
      provider,
      tokens,
      recordedMs,
      timestampMs: recordedMs ?? fallbackMs,
    });
  }

  if (!header) return null;
  return { header, messages, attributions, lines: lines.length };
}

/**
 * Adapter base for the Pi family. Subclasses name the client, its roots and
 * which dedupe lane it uses.
 */
export abstract class PiFamilyAdapter implements Adapter {
  abstract readonly name: AdapterName;
  protected abstract readonly lane: PiLane;
  /** Directories scanned recursively for `*.jsonl`. */
  protected abstract roots(): string[];

  protected home(): string {
    return homedir();
  }

  detect(): boolean {
    return this.roots().some(isDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles(this.roots(), (name) => name.endsWith(".jsonl"), opts);
    if (!anyRoot) return notInstalled(this.name);

    // Fork copies share a key; the first copy seen wins, as in tokscale's
    // aggregation-time dedupe.
    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const parsed = parsePiFile(file, this.name, this.lane);
      if (!parsed) continue;
      totalLines += parsed.lines;
      for (const m of parsed.messages) {
        events.add(makeEvent(this.name, m.key, m.model, m.provider, m.tokens, m.timestampMs));
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

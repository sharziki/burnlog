import { homedir } from "os";
import { basename, join, relative } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import {
  type Buckets,
  EventSet,
  collectFiles,
  envPath,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  obj,
  parseJson,
  parseTimestampStr,
  readLines,
} from "./jsonl-kit.js";

/**
 * Cherry Studio (desktop) agent sessions. Port of tokscale's
 * `sessions/cherrystudio.rs`.
 *
 * Its Agent / Claude Code sessions write standard Claude Code transcripts
 * under the per-user app-data dir:
 *   V2: `<appdata>/CherryStudio/Data/Agents/.claude/projects/<ws>/<session>.jsonl`
 *   V1: `<appdata>/CherryStudio/.claude/projects/…` (pre-upgrade history)
 * where `<appdata>` is `%APPDATA%` (Windows), `~/Library/Application Support`
 * (macOS), `$XDG_CONFIG_HOME` or `~/.config` (Linux). Both roots are read; a
 * transcript present in both (same relative path) is read from V2 only.
 *
 * Cherry Studio appends the SAME API call 3-4 times as it streams (new
 * `uuid`, same `requestId` / `message.id` / usage), so summing rows triple
 * counts. Records are joined into components through shared aliases
 * (requestId, message.id, uuid); each component — or each distinct requestId
 * inside one — contributes once, taking the field-wise max and the latest
 * record's timestamp. Records without any id are kept as they are.
 *
 * Usage is Anthropic-shaped: input_tokens (cache miss),
 * cache_read_input_tokens, cache_creation_input_tokens, output_tokens.
 * `<synthetic>` / unknown models are skipped.
 *
 * Override the CherryStudio directory with BURNLOG_CHERRYSTUDIO_DIR.
 */

function appData(): string {
  if (process.platform === "win32") return envPath("APPDATA") ?? join(homedir(), "AppData", "Roaming");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");
  return envPath("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
}

type UsageRecord = {
  key: string;
  model: string;
  tokens: Buckets;
  eventMs?: number;
  timestampMs: number;
  requestId?: string;
  aliases: string[];
};

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

function merge(records: UsageRecord[], idx: number[]): UsageRecord {
  const timed = idx.filter((i) => records[i].eventMs !== undefined);
  const final =
    timed.length > 0
      ? timed.reduce((best, i) => (records[i].eventMs! > records[best].eventMs! || (records[i].eventMs === records[best].eventMs && i > best) ? i : best))
      : idx[idx.length - 1];
  const out: UsageRecord = { ...records[final], tokens: { ...records[final].tokens } };
  for (const i of idx) {
    const t = records[i].tokens;
    out.tokens.input = Math.max(out.tokens.input, t.input);
    out.tokens.output = Math.max(out.tokens.output, t.output);
    out.tokens.cacheRead = Math.max(out.tokens.cacheRead, t.cacheRead);
    out.tokens.cacheWrite = Math.max(out.tokens.cacheWrite, t.cacheWrite);
  }
  // Key on the component's primary identity, stable across syncs.
  const firstAlias = records[idx[0]].aliases[0];
  out.key = firstAlias ?? records[idx[0]].key;
  return out;
}

export function dedupeCherry(records: UsageRecord[]): UsageRecord[] {
  const uf = new UnionFind(records.length);
  const seen = new Map<string, number>();
  records.forEach((r, i) => {
    for (const a of r.aliases) {
      const prev = seen.get(a);
      if (prev !== undefined) uf.union(i, prev);
      else seen.set(a, i);
    }
  });
  const groups = new Map<number, number[]>();
  records.forEach((_, i) => {
    const root = uf.find(i);
    const g = groups.get(root) ?? [];
    g.push(i);
    groups.set(root, g);
  });

  const selected: Array<[number, UsageRecord]> = [];
  for (const idx of groups.values()) {
    const requestIds = new Set(idx.map((i) => records[i].requestId).filter((r): r is string => !!r));
    if (requestIds.size <= 1) {
      selected.push([idx[0], merge(records, idx)]);
      continue;
    }
    const byRequest = new Map<string, number[]>();
    for (const i of idx) {
      const rid = records[i].requestId;
      if (!rid) {
        selected.push([i, records[i]]);
        continue;
      }
      const g = byRequest.get(rid) ?? [];
      g.push(i);
      byRequest.set(rid, g);
    }
    for (const g of byRequest.values()) {
      const m = merge(records, g);
      m.key = `request:${records[g[0]].requestId}`;
      selected.push([g[0], m]);
    }
  }
  return selected.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

function nn(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export class CherrystudioAdapter implements Adapter {
  readonly name = "cherrystudio" as const;

  private get base(): string {
    return envPath("BURNLOG_CHERRYSTUDIO_DIR") ?? join(appData(), "CherryStudio");
  }

  private roots(): { v1: string; v2: string } {
    return {
      v1: join(this.base, ".claude", "projects"),
      v2: join(this.base, "Data", "Agents", ".claude", "projects"),
    };
  }

  detect(): boolean {
    const { v1, v2 } = this.roots();
    return isDir(v1) || isDir(v2);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { v1, v2 } = this.roots();
    const newer = collectFiles([v2], (n) => n.endsWith(".jsonl"), opts);
    const older = collectFiles([v1], (n) => n.endsWith(".jsonl"), opts);
    if (!newer.anyRoot && !older.anyRoot) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    // A V2 transcript supersedes its V1 counterpart even when only V1 changed.
    const v2Rel = new Set(collectFiles([v2], (n) => n.endsWith(".jsonl"), {}).files.map((f) => relative(v2, f)));
    const files = [...newer.files, ...older.files.filter((f) => !v2Rel.has(relative(v1, f)))];

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const lines = readLines(file);
      totalLines += lines.length;
      for (const e of this.parseFile(file, lines)) events.add(e);
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }

  private parseFile(file: string, lines: string[]): BurnEvent[] {
    const fallbackMs = mtimeMs(file);
    const session = basename(file, ".jsonl");
    const records: UsageRecord[] = [];
    lines.forEach((line, i) => {
      const rec = parseJson(line);
      if (!rec || rec.type !== "assistant") return;
      const message = obj(rec.message);
      const usage = obj(message?.usage);
      if (!message || !usage) return;
      const model = typeof message.model === "string" ? message.model.trim() : "";
      if (!model || model === "<synthetic>" || model.toLowerCase() === "unknown") return;
      const tokens = {
        input: nn(usage.input_tokens),
        output: nn(usage.output_tokens),
        cacheRead: nn(usage.cache_read_input_tokens),
        cacheWrite: nn(usage.cache_creation_input_tokens),
      };
      if (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite <= 0) return;
      const id = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const requestId = id(rec.requestId) ?? id(message.requestId);
      const messageId = id(message.id);
      const uuid = id(rec.uuid) ?? id(message.uuid);
      const aliases = [
        ...(requestId ? [`request:${requestId}`] : []),
        ...(messageId ? [`message:${messageId}`] : []),
        ...(uuid ? [`uuid:${uuid}`] : []),
      ];
      const eventMs = typeof rec.timestamp === "string" ? parseTimestampStr(rec.timestamp) : undefined;
      records.push({
        key: `${session}:line:${i}`,
        model,
        tokens,
        eventMs,
        timestampMs: eventMs ?? fallbackMs,
        requestId,
        aliases,
      });
    });
    const out: BurnEvent[] = [];
    for (const r of dedupeCherry(records)) {
      const provider = mapProvider(undefined, r.model);
      const e = makeEvent(this.name, r.key, r.model, provider, r.tokens, r.timestampMs);
      if (e) out.push(e);
    }
    return out;
  }
}

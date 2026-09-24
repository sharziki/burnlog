import { createHash } from "crypto";
import { readdirSync, readFileSync, realpathSync, statSync } from "fs";
import { join } from "path";
import type { AdapterName, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";

/**
 * Shared plumbing for the JSONL-log adapters ported from tokscale
 * (pi-format family, qwen, kimi, gjc, commandcode, zcode, codebuddy, junie,
 * reasonix, mcode, copilot OTEL, cherrystudio, opencodereview).
 *
 * Every one of those formats needs the same four things: find files under a
 * few roots, read them line by line, turn a source-specific dedupe key into an
 * opaque requestId, and build a BurnEvent. Only the per-format parsing lives in
 * the adapter files.
 */

/**
 * Opaque, stable requestId. Source keys often embed session ids, file paths
 * or project slugs; hashing keeps dedupe exact while the id reveals nothing.
 */
export function opaqueId(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/** Non-negative integer, or 0. Accepts numbers only (serde `i64` fields). */
export function int(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Like `int` but `undefined` when the field is absent or not a number. */
export function optInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Trimmed non-empty string, or undefined. */
export function nonEmpty(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Provider bucket: trust an explicit provider burnlog stores, else infer from the model. */
export function mapProvider(explicit: string | undefined, model: string): BurnEvent["provider"] {
  const p = explicit?.trim().toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google") return p;
  if (p === "gemini" || p === "google-vertex" || p === "vertex") return "google";
  return providerFromModel(model);
}

const NAIVE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;
const ZONED = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

/**
 * tokscale's `parse_timestamp_str`: RFC 3339, else an offset-less datetime read
 * as UTC (Date.parse would read it as local time), else an epoch number where
 * values below 1e12 are seconds.
 */
export function parseTimestampStr(value: string): number | undefined {
  const v = value.trim();
  if (ZONED.test(v)) {
    const t = Date.parse(v.replace(" ", "T"));
    return Number.isFinite(t) ? t : undefined;
  }
  const naive = NAIVE.exec(v);
  if (naive) {
    const t = Date.parse(`${naive[1]}T${naive[2]}Z`);
    return Number.isFinite(t) ? t : undefined;
  }
  if (/^-?\d+$/.test(v)) return epochMs(Number(v));
  return undefined;
}

/** Strict RFC 3339 only (chrono's `parse_from_rfc3339`). */
export function parseRfc3339(value: unknown): number | undefined {
  if (typeof value !== "string" || !ZONED.test(value.trim())) return undefined;
  const t = Date.parse(value.trim().replace(" ", "T"));
  return Number.isFinite(t) ? t : undefined;
}

/** Epoch seconds-or-millis → millis; non-positive is "no timestamp". */
export function epochMs(n: number): number | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n >= 1e12 ? Math.floor(n) : Math.floor(n * 1000);
}

/** tokscale's `parse_timestamp_value`: a string or an epoch number. */
export function parseTimestampValue(v: unknown): number | undefined {
  if (typeof v === "string") return parseTimestampStr(v);
  if (typeof v === "number" && Number.isInteger(v)) return epochMs(v);
  return undefined;
}

export function isoOrNull(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Lines of a text file, trimmed, empty ones dropped. A UTF-8 BOM on the first
 * line is stripped (tokscale does the same). Invalid UTF-8 decodes to U+FFFD;
 * `strictUtf8` drops those lines the way tokscale's byte-strict readers do.
 */
export function readLines(file: string, strictUtf8 = false): string[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    if (strictUtf8 && t.includes("�")) continue;
    out.push(t);
  }
  return out;
}

export function parseJson(line: string): Record<string, unknown> | undefined {
  try {
    return obj(JSON.parse(line));
  } catch {
    return undefined;
  }
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function mtimeMs(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return Date.now();
  }
}

/**
 * Every file under `root` whose name passes `match`. Like tokscale's WalkDir
 * scan: symlinked files count, symlinked directories are not followed.
 * `skipDir` prunes by directory name.
 */
export function walkFiles(
  root: string,
  match: (name: string, full: string) => boolean,
  skipDir?: (name: string, full: string) => boolean,
): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDir || !skipDir(e.name, full)) stack.push(full);
      } else if (e.isFile() || (e.isSymbolicLink() && isFile(full))) {
        if (match(e.name, full)) out.push(full);
      }
    }
  }
  return out.sort();
}

/** First non-blank value of an env var, or undefined. */
export function envPath(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

/**
 * Collect files across roots, dropping duplicates reached through overlapping
 * roots, and apply the incremental `since` window.
 */
export function collectFiles(
  roots: string[],
  match: (name: string, full: string) => boolean,
  opts: ScanOptions,
  skipDir?: (name: string, full: string) => boolean,
): { files: string[]; anyRoot: boolean } {
  const seen = new Set<string>();
  const files: string[] = [];
  let anyRoot = false;
  for (const root of roots) {
    if (!isDir(root)) continue;
    anyRoot = true;
    for (const f of walkFiles(root, match, skipDir)) {
      let key = f;
      try {
        key = realpathSync(f);
      } catch {
        /* keep path */
      }
      if (seen.has(key)) continue;
      seen.add(key);
      if (!shouldRead(mtimeMs(f), opts.since)) continue;
      files.push(f);
    }
  }
  return { files, anyRoot };
}

/** Token buckets in burnlog's convention. */
export type Buckets = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export function bucketSum(b: Buckets): number {
  return b.input + b.output + b.cacheRead + b.cacheWrite;
}

/**
 * Build an event, or null when it carries no tokens or no usable timestamp.
 * `key` is the source's own dedupe key; it is hashed with the adapter name.
 */
export function makeEvent(
  source: AdapterName,
  key: string,
  model: string,
  provider: BurnEvent["provider"],
  b: Buckets,
  timestampMs: number | undefined,
): BurnEvent | null {
  if (bucketSum(b) <= 0) return null;
  const timestamp = isoOrNull(timestampMs);
  if (!timestamp) return null;
  return {
    requestId: opaqueId(source, key),
    source,
    model,
    provider,
    inputTokens: b.input,
    outputTokens: b.output,
    cacheCreationTokens: b.cacheWrite,
    cacheReadTokens: b.cacheRead,
    timestamp,
  };
}

/**
 * Dedupe by requestId. `prefer` decides whether a later duplicate replaces the
 * kept one; by default the first seen wins (fork/copy semantics).
 */
export class EventSet {
  private byId = new Map<string, BurnEvent>();
  constructor(private prefer: (existing: BurnEvent, candidate: BurnEvent) => boolean = () => false) {}
  add(e: BurnEvent | null): void {
    if (!e) return;
    const existing = this.byId.get(e.requestId);
    if (!existing || this.prefer(existing, e)) this.byId.set(e.requestId, e);
  }
  values(): BurnEvent[] {
    return [...this.byId.values()];
  }
}

export function notInstalled(source: AdapterName): ScanResult {
  return { source, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
}

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, num, toMs } from "./fileutil.js";

/**
 * Jcode adapter (ported from tokscale's `sessions/jcode.rs`).
 *
 * Jcode keeps one compact JSON snapshot per session plus an append-only
 * journal that holds changes made since the last checkpoint:
 *
 *   $JCODE_HOME/sessions/session_<name>_<ts>_<hex>.json
 *   $JCODE_HOME/sessions/session_<name>_<ts>_<hex>.journal.jsonl
 *
 * `JCODE_HOME` defaults to `~/.jcode` on every platform. Local/dev builds use
 * `~/.jcode-local`, which is scanned too when `JCODE_HOME` is unset (tokscale
 * reads only the one home; overlap is harmless because ids are deduped).
 * `.bak` / `.pre-wipe-*.bak` copies are ignored, as tokscale ignores them.
 *
 * Snapshot shape (only these fields are read):
 *   { id, model, messages: [{ id, role, timestamp, tool_duration_ms,
 *       token_usage: { input_tokens, output_tokens, cache_read_input_tokens,
 *                      cache_creation_input_tokens, reasoning_output_tokens } }] }
 * Journal lines: { meta?: { model }, append_messages: [...same message shape] }
 *
 * Cache accounting follows tokscale: when a message's usage carries
 * `cache_creation_input_tokens` (Anthropic shape) or cache reads exceed input,
 * input is already net of cache; otherwise (OpenAI shape) cached reads are a
 * subset of input_tokens and are subtracted out. Reasoning tokens are added
 * to output, as tokscale bills them as their own additive bucket.
 *
 * A journal entry that repeats an id replaces the snapshot's value (journal
 * wins); across files the first occurrence of a message id wins. Unlike
 * tokscale (which keys on session + message), a forked session that copies
 * its parent's messages is therefore not double-counted.
 *
 * Override the jcode home with BURNLOG_JCODE_DIR.
 */

type JcodeUsage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  reasoning_output_tokens?: unknown;
};

type JcodeMessage = {
  id?: unknown;
  role?: unknown;
  timestamp?: unknown;
  token_usage?: unknown;
  tool_duration_ms?: unknown;
};

function homes(): string[] {
  const explicit = envDir("BURNLOG_JCODE_DIR");
  if (explicit) return [explicit];
  const env = envDir("JCODE_HOME");
  if (env) return [env];
  return [join(homedir(), ".jcode"), join(homedir(), ".jcode-local")];
}

function modelOf(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "unknown";
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Token buckets for one message, or null when it carries no usable usage. */
export function jcodeTokens(raw: unknown): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} | null {
  if (!isObj(raw)) return null;
  const u = raw as JcodeUsage;
  // A wrong-typed field drops only this message (tokscale's lenient parse).
  for (const k of Object.keys(u) as Array<keyof JcodeUsage>) {
    const v = u[k];
    if (v !== null && v !== undefined && typeof v !== "number") return null;
  }
  const reported = num(u.input_tokens);
  const cacheRead = num(u.cache_read_input_tokens);
  const cacheWrite = num(u.cache_creation_input_tokens);
  const split = (u.cache_creation_input_tokens !== undefined && u.cache_creation_input_tokens !== null) || cacheRead > reported;
  const input = split ? reported : reported - Math.min(cacheRead, reported);
  const output = num(u.output_tokens) + num(u.reasoning_output_tokens);
  if (input + output + cacheRead + cacheWrite === 0) return null;
  return { input, output, cacheRead, cacheWrite };
}

function mtime(p: string): number | undefined {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return undefined;
  }
}

export class JcodeAdapter implements Adapter {
  readonly name = "jcode" as const;

  private get roots(): string[] {
    return homes().filter((h) => existsSync(join(h, "sessions")));
  }

  detect(): boolean {
    return this.roots.length > 0;
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const roots = this.roots;
    if (roots.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const root of roots) {
      const dir = join(root, "sessions");
      let names: string[];
      try {
        names = readdirSync(dir).filter((n) => n.startsWith("session_") && n.endsWith(".json")).sort();
      } catch {
        continue;
      }

      for (const name of names) {
        const snapshot = join(dir, name);
        const journal = join(dir, `${name.slice(0, -".json".length)}.journal.jsonl`);
        const snapM = mtime(snapshot);
        const journalM = mtime(journal);
        if (snapM === undefined) continue;
        if (!shouldRead(Math.max(snapM, journalM ?? 0), opts.since)) continue;

        let session: Record<string, unknown>;
        try {
          const parsed = JSON.parse(readFileSync(snapshot, "utf8").replace(/^\uFEFF/, "")) as unknown;
          if (!isObj(parsed)) continue;
          session = parsed;
        } catch {
          continue;
        }
        scannedFiles++;
        totalLines++;

        const sessionId =
          typeof session.id === "string" ? session.id : name.slice(0, -".json".length);
        let model = modelOf(session.model);

        // Ordered per-file results; journal replacements overwrite in place.
        const parsed: BurnEvent[] = [];
        const indexByKey = new Map<string, number>();

        const ingest = (messages: unknown, fallbackMs: number, scope: string, journalPass: boolean): void => {
          if (!Array.isArray(messages)) return;
          messages.forEach((m: unknown, ordinal) => {
            if (!isObj(m)) return;
            const msg = m as JcodeMessage;
            // Jcode message ids (`message_<ms>_<random>`) are globally unique,
            // so key on them alone: a forked/recovered session copies its
            // parent's messages verbatim, and tokscale's (session, id) key
            // counts those twice. Synthetic ids stay session-scoped.
            const key =
              typeof msg.id === "string" && msg.id ? `jcode:${msg.id}` : `jcode:${sessionId}:${scope}:${ordinal}`;
            const tokens = jcodeTokens(msg.token_usage);
            if (!tokens) return;

            const explicit = typeof msg.timestamp === "string" ? toMs(msg.timestamp) : undefined;
            const duration =
              typeof msg.tool_duration_ms === "number" && msg.tool_duration_ms > 0 ? msg.tool_duration_ms : 0;
            // The timestamp marks the turn's end; back-anchor to its start.
            let ts = explicit ?? fallbackMs;
            if (explicit !== undefined && duration > 0 && explicit - duration > 0) ts = explicit - duration;

            const event: BurnEvent = {
              requestId: hashId(key),
              source: this.name,
              model,
              provider: providerFromModel(model),
              inputTokens: tokens.input,
              outputTokens: tokens.output,
              cacheCreationTokens: tokens.cacheWrite,
              cacheReadTokens: tokens.cacheRead,
              timestamp: new Date(ts).toISOString(),
            };
            const existing = indexByKey.get(key);
            if (existing === undefined) {
              indexByKey.set(key, parsed.length);
              parsed.push(event);
            } else if (journalPass) {
              // Journal carries the authoritative, later usage for this id.
              parsed[existing] = event;
            }
            // A duplicate within the snapshot itself: first wins.
          });
        };

        ingest(session.messages, snapM, "snapshot", false);

        if (journalM !== undefined) {
          let content = "";
          try {
            content = readFileSync(journal, "utf8").replace(/^\uFEFF/, "");
            scannedFiles++;
          } catch {
            content = "";
          }
          content.split("\n").forEach((line, lineIndex) => {
            const t = line.trim();
            if (!t) return;
            totalLines++;
            let entry: unknown;
            try {
              entry = JSON.parse(t);
            } catch {
              return;
            }
            if (!isObj(entry)) return;
            const meta = entry.meta;
            if (isObj(meta) && typeof meta.model === "string") model = modelOf(meta.model);
            ingest(entry.append_messages, journalM, `journal:${lineIndex}`, true);
          });
        }

        for (const e of parsed) {
          if (!byKey.has(e.requestId)) byKey.set(e.requestId, e);
        }
      }
    }

    return { source: this.name, events: [...byKey.values()], scannedFiles, totalLines };
  }
}

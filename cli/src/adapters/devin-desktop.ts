import { existsSync, readFileSync, statSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { appData, envDir, hashId, isDir, toMs, walkFiles, xdgData } from "./fileutil.js";
import { querySqlite, type Row } from "./sqlite.js";

/**
 * Devin Desktop — the NDJSON half of tokscale's `sessions/devin.rs`.
 *
 * The desktop app streams ACP events, one file per session:
 *
 *   ~/Library/Application Support/Devin/User/acp-events/<uuid>.ndjson   (macOS)
 *   ~/.config/{Devin,devin}/User/acp-events/<uuid>.ndjson               (Linux)
 *   %APPDATA%\Devin\User\acp-events\<uuid>.ndjson                       (Windows)
 *
 * Each line is `{ notification: {...} }`. Two usage shapes exist:
 *
 * - Canonical ACP `sessionUpdate: "usage_update"` with
 *   `_meta["cognition.ai/inputTokens" | "outputTokens" | "cachedReadTokens" |
 *   "cachedWriteTokens"]`. Input and cache counts are CUMULATIVE (latest
 *   wins), output is per step (summed), and inputTokens INCLUDES the cached
 *   reads — so cache reads are subtracted from input. One event per file.
 * - Older captures embed `{input_tokens, output_tokens, cache_read_tokens,
 *   cache_creation_tokens}` under `metrics`/`metadata`; one event per line.
 *
 * The Devin CLI's `sessions.db` is the authoritative record for the same
 * work. As in tokscale, a desktop stream whose `session_info_update` title
 * matches exactly one CLI session is resolved to it (to borrow its model),
 * and is dropped when that CLI session already has usage — the devin-cli
 * source counts it, and counting both would double it. Titles are compared
 * in memory only; nothing about them is kept.
 *
 * Overrides: BURNLOG_DEVIN_DESKTOP_DIR (acp-events dir) and
 * BURNLOG_DEVIN_CLI_DIR (dir holding sessions.db, or the db itself).
 */

type Json = Record<string, unknown>;

function eventRoots(): string[] {
  const explicit = envDir("BURNLOG_DEVIN_DESKTOP_DIR");
  if (explicit) return [explicit];
  const home = homedir();
  const roots = [
    join(home, "Library", "Application Support", "Devin", "User", "acp-events"),
    join(home, ".config", "Devin", "User", "acp-events"),
    join(home, ".config", "devin", "User", "acp-events"),
  ];
  if (process.platform === "win32") roots.push(join(appData(), "Devin", "User", "acp-events"));
  roots.push(join(home, "AppData", "Roaming", "Devin", "User", "acp-events"));
  return [...new Set(roots)];
}

function cliDbPaths(): string[] {
  const explicit = envDir("BURNLOG_DEVIN_CLI_DIR");
  const dirs = explicit
    ? [explicit]
    : [
        join(xdgData(), "devin", "cli"),
        ...(process.platform === "win32" ? [join(appData(), "devin", "cli")] : []),
        join(homedir(), "AppData", "Roaming", "devin", "cli"),
      ];
  const out = new Set<string>();
  for (const d of dirs) {
    const db = isDir(d) ? join(d, "sessions.db") : d;
    if (existsSync(db) && !isDir(db)) out.add(db);
  }
  return [...out];
}

const isRoutingMode = (m: string) => m === "adaptive";

type CliSession = { id: string; model?: string };

/** title -> session, or null when the title is shared by several sessions. */
type Lookup = Map<string, CliSession | null>;

async function loadCli(): Promise<{ lookup: Lookup; withUsage: Set<string> }> {
  const lookup: Lookup = new Map();
  const withUsage = new Set<string>();
  for (const db of cliDbPaths()) {
    let rows: Row[] = [];
    try {
      rows = await querySqlite(
        db,
        "SELECT id, title, model FROM sessions WHERE title IS NOT NULL AND TRIM(title) != ''",
      );
    } catch {
      rows = [];
    }
    for (const r of rows) {
      const id = String(r.id);
      const title = String(r.title).trim();
      if (!title) continue;
      const model = typeof r.model === "string" && r.model ? r.model : undefined;
      if (!lookup.has(title)) lookup.set(title, { id, model });
      else if (lookup.get(title)?.id !== id) lookup.set(title, null);
    }

    // Which CLI sessions have attributable usage — same rules as the CLI
    // parser: assistant role, a real model, non-zero metrics or num_tokens.
    let nodes: Row[] = [];
    try {
      nodes = await querySqlite(
        db,
        "SELECT m.session_id AS session_id, m.chat_message AS chat_message, s.model AS model " +
          "FROM message_nodes m JOIN sessions s ON m.session_id = s.id",
      );
    } catch {
      nodes = [];
    }
    for (const r of nodes) {
      const sid = String(r.session_id);
      if (withUsage.has(sid)) continue;
      let chat: Json;
      try {
        chat = JSON.parse(String(r.chat_message)) as Json;
      } catch {
        continue;
      }
      if (chat?.role !== "assistant") continue;
      const meta = (chat.metadata ?? {}) as Json;
      const gen = typeof meta.generation_model === "string" && meta.generation_model ? meta.generation_model : undefined;
      const model = gen ?? (typeof r.model === "string" ? r.model : "");
      if (!model || isRoutingMode(model)) continue;
      const m = (meta.metrics ?? {}) as Json;
      let total = pos(m.input_tokens) + pos(m.output_tokens) + pos(m.cache_read_tokens) + pos(m.cache_creation_tokens);
      if (total === 0) total = pos(meta.num_tokens);
      if (total > 0) withUsage.add(sid);
    }
  }
  return { lookup, withUsage };
}

/** Non-negative integer, or undefined when absent / not an integer. */
function int(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) ? Math.max(0, v) : undefined;
}
function pos(v: unknown): number {
  return int(v) ?? 0;
}

function ptr(v: unknown, ...path: string[]): unknown {
  let cur = v;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

function notificationTimestamp(n: Json): number | undefined {
  const v =
    ptr(n, "content", "metadata", "created_at") ??
    ptr(n, "metadata", "created_at") ??
    n.created_at ??
    n.timestamp;
  return typeof v === "string" ? toMs(v) : undefined;
}

function notificationModel(n: Json): string | undefined {
  const v =
    ptr(n, "content", "metadata", "generation_model") ??
    ptr(n, "metadata", "generation_model") ??
    ptr(n, "_meta", "cognition.ai/model");
  return typeof v === "string" && v ? v : undefined;
}

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type DesktopMessage = {
  /** Resolved CLI session id, or the file's own id. */
  sessionId: string;
  model: string;
  timestamp: number;
  tokens: Usage;
  suffix: string;
};

/** Port of `parse_devin_desktop_ndjson_with_lookup`. */
export function parseDevinDesktop(text: string, fileId: string, fallbackTs: number, lookup: Lookup): DesktopMessage[] {
  const legacy: Array<Omit<DesktopMessage, "sessionId" | "model"> & { title?: string; hint?: string }> = [];
  let acp: (Usage & { model?: string; timestamp?: number }) | null = null;
  let title: string | undefined;

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let ev: Json;
    try {
      ev = JSON.parse(line) as Json;
    } catch {
      return;
    }
    const n = ev?.notification;
    if (!n || typeof n !== "object") return;
    const note = n as Json;
    const update = note.sessionUpdate;

    if (update === "session_info_update") {
      const t = typeof note.title === "string" ? note.title.trim() : "";
      if (t) title = t;
      return;
    }

    if (update === "usage_update") {
      const meta = note._meta;
      const input = int(ptr(meta, "cognition.ai/inputTokens"));
      const cacheRead = int(ptr(meta, "cognition.ai/cachedReadTokens"));
      const cacheWrite = int(ptr(meta, "cognition.ai/cachedWriteTokens"));
      const output = int(ptr(meta, "cognition.ai/outputTokens"));
      if (input !== undefined || cacheRead !== undefined || cacheWrite !== undefined || output !== undefined) {
        acp ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        if (input !== undefined) acp.input = input;
        if (cacheRead !== undefined) acp.cacheRead = cacheRead;
        if (cacheWrite !== undefined) acp.cacheWrite = cacheWrite;
        if (output !== undefined) acp.output += output;
        acp.model ??= notificationModel(note);
        const ts = notificationTimestamp(note);
        if (ts !== undefined) acp.timestamp = ts;
        return;
      }
    }

    const usage =
      ptr(note, "content", "metadata", "metrics") ??
      ptr(note, "metadata", "metrics") ??
      note.metrics ??
      ptr(note, "content", "metadata") ??
      note.metadata;
    if (!usage || typeof usage !== "object") return;
    const u = usage as Json;
    const tokens: Usage = {
      input: pos(u.input_tokens),
      output: pos(u.output_tokens),
      cacheRead: pos(u.cache_read_tokens),
      cacheWrite: pos(u.cache_creation_tokens),
    };
    if (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite === 0) return;
    legacy.push({
      title,
      hint: notificationModel(note),
      timestamp: notificationTimestamp(note) ?? fallbackTs,
      tokens,
      suffix: String(index),
    });
  });

  const resolve = (t: string | undefined, hint: string | undefined) => {
    const session = t !== undefined ? (lookup.get(t) ?? undefined) : undefined;
    const sessionModel = session?.model && !isRoutingMode(session.model) ? session.model : undefined;
    const m = sessionModel ?? hint;
    return {
      sessionId: session?.id ?? fileId,
      model: m && !isRoutingMode(m) ? m : "devin",
    };
  };

  const final = acp as (Usage & { model?: string; timestamp?: number }) | null;
  if (final) {
    // ACP inputTokens is the whole prompt, cached reads included.
    const tokens: Usage = {
      input: Math.max(0, final.input - final.cacheRead),
      output: final.output,
      cacheRead: final.cacheRead,
      cacheWrite: final.cacheWrite,
    };
    if (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite === 0) return [];
    return [
      { ...resolve(title, final.model), timestamp: final.timestamp ?? fallbackTs, tokens, suffix: "usage" },
    ];
  }
  return legacy.map((l) => ({ ...resolve(l.title, l.hint), timestamp: l.timestamp, tokens: l.tokens, suffix: l.suffix }));
}

export class DevinDesktopAdapter implements Adapter {
  readonly name = "devin-desktop" as const;

  private roots(): string[] {
    return eventRoots().filter(isDir);
  }

  detect(): boolean {
    return this.roots().length > 0;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const roots = this.roots();
    if (roots.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = [...new Set(roots.flatMap((r) => walkFiles(r, (n) => n.endsWith(".ndjson"))))].sort();
    const toRead: Array<{ file: string; mtimeMs: number }> = [];
    for (const file of files) {
      try {
        const mtimeMs = statSync(file).mtimeMs;
        if (shouldRead(mtimeMs, opts.since)) toRead.push({ file, mtimeMs });
      } catch {
        continue;
      }
    }
    if (toRead.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0 };
    }

    const { lookup, withUsage } = await loadCli();
    const byId = new Map<string, BurnEvent>();
    let totalLines = 0;
    let suppressed = 0;

    for (const { file, mtimeMs } of toRead) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      totalLines += text.split("\n").length;
      const fileId = basename(file, ".ndjson") || "unknown";
      for (const m of parseDevinDesktop(text, fileId, Math.round(mtimeMs), lookup)) {
        // The CLI database already counts this session.
        if (withUsage.has(m.sessionId)) {
          suppressed++;
          continue;
        }
        const requestId = hashId("devin-desktop", fileId, m.suffix);
        byId.set(requestId, {
          requestId,
          source: this.name,
          model: m.model,
          provider: providerFromModel(m.model),
          inputTokens: m.tokens.input,
          outputTokens: m.tokens.output,
          cacheCreationTokens: m.tokens.cacheWrite,
          cacheReadTokens: m.tokens.cacheRead,
          timestamp: new Date(m.timestamp).toISOString(),
        });
      }
    }

    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles: toRead.length,
      totalLines,
      ...(suppressed > 0 ? { note: `${suppressed} session(s) left to devin-cli, which already records them` } : {}),
    };
  }
}

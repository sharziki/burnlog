import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, num, toMs, walkFiles } from "./fileutil.js";

/**
 * Shared parser for the Cline family — Cline, Roo Code and Kilo Code — ported
 * from tokscale's `sessions/roocode.rs` (+ `cline.rs`, `kilocode.rs`).
 *
 * Roo and Kilo are Cline forks and keep the same VS Code globalStorage task
 * log, one directory per task:
 *
 *   <globalStorage>/<extension-id>/tasks/<taskId>/ui_messages.json
 *   <globalStorage>/<extension-id>/tasks/<taskId>/api_conversation_history.json
 *
 * `ui_messages.json` is an array of UI rows. Every API request is a
 * `{ type: "say", say: "api_req_started", ts, text }` row whose `text` is a
 * JSON string carrying THAT request's usage (a per-request delta, not a
 * running total):
 *
 *   { tokensIn, tokensOut, cacheReads, cacheWrites, cost, apiProtocol }
 *
 * Buckets are Anthropic-style — tokensIn excludes cache — so they map 1:1.
 * All other rows (the chat itself) are ignored.
 *
 * Model: current Cline stamps `modelInfo: { providerId, modelId }` on each
 * row. Older Roo/Kilo rows don't, and tokscale then takes the last
 * `<model>` tag inside an `<environment_details>` block of the sibling
 * `api_conversation_history.json`. That file is the conversation, so it is
 * only opened when a row lacks `modelInfo`, and nothing but the tag's value
 * is kept.
 *
 * Cline's CLI (not the extension) writes a different file,
 * `~/.cline/data/sessions/<id>/<id>.messages.json`, with assistant messages
 * carrying `metrics: { inputTokens, outputTokens, cacheReadTokens,
 * cacheWriteTokens }`. There `inputTokens` INCLUDES cache reads and writes,
 * so fresh input = inputTokens − cacheRead − cacheWrite (as tokscale does).
 *
 * requestId: sha of (client, task id, row ts, occurrence) for task logs,
 * sha of (session id, message id) for the CLI — never the path itself.
 */

const VSCODE_GLOBAL_STORAGE = ["Code", "User", "globalStorage"];

/** Where VS Code keeps an extension's task dirs, per OS + remote server. */
export function vscodeTaskRoots(extensionId: string): string[] {
  const home = homedir();
  const rel = [...VSCODE_GLOBAL_STORAGE, extensionId, "tasks"];
  const roots = [
    join(home, ".config", ...rel),
    join(home, "Library", "Application Support", ...rel),
    join(home, "AppData", "Roaming", ...rel),
    join(home, ".vscode-server", "data", "User", "globalStorage", extensionId, "tasks"),
  ];
  const appData = process.platform === "win32" ? envDir("APPDATA") : undefined;
  if (appData) roots.splice(2, 0, join(appData, ...rel));
  return [...new Set(roots)];
}

/** Cline CLI session roots, honouring the same env vars Cline does. */
export function clineCliRoots(): string[] {
  const sessionDir = envDir("CLINE_SESSION_DATA_DIR");
  if (sessionDir) return [sessionDir];
  const dataDir = envDir("CLINE_DATA_DIR");
  if (dataDir) return [join(dataDir, "sessions")];
  const clineDir = envDir("CLINE_DIR");
  if (clineDir) return [join(clineDir, "data", "sessions")];
  return [join(homedir(), ".cline", "data", "sessions")];
}

type UiRow = {
  type?: string;
  say?: string;
  text?: string;
  ts?: unknown;
  modelInfo?: { providerId?: string; modelId?: string };
};

const trimmed = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Last `<model>` inside any `<environment_details>` block, or undefined. */
export function modelFromHistory(content: string): string | undefined {
  let last: string | undefined;
  const block = /<environment_details>([\s\S]*?)<\/environment_details>/g;
  for (let m = block.exec(content); m; m = block.exec(content)) {
    const tag = /<model>([\s\S]*?)<\/model>/.exec(m[1]);
    const v = tag?.[1].trim();
    if (v) last = v;
  }
  return last;
}

function mapProvider(provider: string | undefined, model: string): BurnEvent["provider"] {
  const p = provider?.toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google") return p;
  if (p === "gemini") return "google";
  return providerFromModel(model);
}

/** Events from one `ui_messages.json`. */
export function parseUiMessages(source: string, file: string, raw: string): BurnEvent[] {
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  const taskId = basename(dirname(file)) || "unknown";
  let historyModel: string | null | undefined; // undefined = not read yet
  const legacyModel = (): string => {
    if (historyModel === undefined) {
      try {
        historyModel = modelFromHistory(readFileSync(join(dirname(file), "api_conversation_history.json"), "utf8")) ?? null;
      } catch {
        historyModel = null;
      }
    }
    return historyModel ?? "unknown";
  };

  const seen = new Map<string, number>();
  const out: BurnEvent[] = [];
  for (const row of rows as UiRow[]) {
    if (!row || row.type !== "say" || row.say !== "api_req_started") continue;
    if (typeof row.text !== "string") continue;
    const tsKey = typeof row.ts === "string" || typeof row.ts === "number" ? String(row.ts) : "";
    const ts = toMs(row.ts);
    if (ts === undefined) continue;

    let p: Record<string, unknown>;
    try {
      p = JSON.parse(row.text) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!p || typeof p !== "object") continue;

    const input = num(p.tokensIn);
    const output = num(p.tokensOut);
    const cacheRead = num(p.cacheReads);
    const cacheWrite = num(p.cacheWrites);
    // The row is written when the request starts and filled in when it
    // finishes; an all-zero row is either unfinished or empty.
    if (input + output + cacheRead + cacheWrite === 0) continue;

    const model = trimmed(row.modelInfo?.modelId) ?? legacyModel();
    // A nested apiProtocol ("bedrock/anthropic") outranks modelInfo's
    // provider in tokscale; burnlog only needs the family, so either works.
    const provider = trimmed(p.apiProtocol) ?? trimmed(row.modelInfo?.providerId);

    const n = seen.get(tsKey) ?? 0;
    seen.set(tsKey, n + 1);
    const requestId = hashId(source, taskId, tsKey, n);
    out.push({
      requestId,
      source,
      model,
      provider: mapProvider(provider?.split("/").pop(), model),
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      timestamp: new Date(ts).toISOString(),
    });
  }
  return out;
}

type CliMessage = {
  id?: string;
  role?: string;
  ts?: unknown;
  modelInfo?: { id?: string; provider?: string };
  metrics?: Record<string, unknown>;
};

/** Events from one Cline CLI `<id>.messages.json`. */
export function parseClineCliMessages(file: string, raw: string, mtimeMs: number): BurnEvent[] {
  let doc: { sessionId?: string; messages?: CliMessage[] };
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  const stem = basename(file).replace(/\.messages\.json$/, "");
  // The manifest sits next to it as <id>.json; only model/provider are read.
  let manifest: { session_id?: string; model?: string; provider?: string } = {};
  try {
    manifest = JSON.parse(readFileSync(join(dirname(file), `${stem}.json`), "utf8")) ?? {};
  } catch {
    // no manifest
  }

  const sessionId = trimmed(doc.sessionId) ?? trimmed(manifest.session_id) ?? stem;
  let model = trimmed(manifest.model) ?? "unknown";
  let provider = trimmed(manifest.provider) ?? "unknown";
  let assistantIndex = 0;
  const out: BurnEvent[] = [];

  for (const m of Array.isArray(doc.messages) ? doc.messages : []) {
    if (!m || m.role !== "assistant") continue;
    model = trimmed(m.modelInfo?.id) ?? model;
    provider = trimmed(m.modelInfo?.provider) ?? provider;
    const x = m.metrics;
    if (!x || typeof x !== "object") continue;

    const cacheRead = num(x.cacheReadTokens);
    const cacheWrite = num(x.cacheWriteTokens);
    const input = Math.max(0, num(x.inputTokens) - cacheRead - cacheWrite);
    const output = num(x.outputTokens);
    const idx = assistantIndex++;
    if (input + output + cacheRead + cacheWrite === 0) continue;

    const ts = toMs(m.ts) ?? Math.floor(mtimeMs);
    const key = trimmed(m.id) ?? String(idx);
    out.push({
      requestId: hashId("cline-cli", sessionId, key),
      source: "cline",
      model,
      provider: mapProvider(provider, model),
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      timestamp: new Date(ts).toISOString(),
    });
  }
  return out;
}

/**
 * One Cline-family client. `envVar` replaces every default root (and for
 * Cline also covers CLI `*.messages.json` files found under it).
 */
export class VscodeTaskAdapter implements Adapter {
  constructor(
    readonly name: string,
    private readonly extensionId: string,
    private readonly envVar: string,
    private readonly withCli = false,
  ) {}

  private roots(): { tasks: string[]; cli: string[] } {
    const explicit = envDir(this.envVar);
    if (explicit) return { tasks: [explicit], cli: this.withCli ? [explicit] : [] };
    return {
      tasks: vscodeTaskRoots(this.extensionId),
      cli: this.withCli ? clineCliRoots() : [],
    };
  }

  detect(): boolean {
    const { tasks, cli } = this.roots();
    return [...tasks, ...cli].some((r) => existsSync(r));
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { tasks, cli } = this.roots();
    const present = { tasks: tasks.filter((r) => existsSync(r)), cli: cli.filter((r) => existsSync(r)) };
    if (present.tasks.length + present.cli.length === 0) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    const read = (file: string): { raw: string; mtimeMs: number } | null => {
      try {
        const { mtimeMs } = statSync(file);
        if (!shouldRead(mtimeMs, opts.since)) return null;
        const raw = readFileSync(file, "utf8");
        scannedFiles++;
        return { raw, mtimeMs };
      } catch {
        return null;
      }
    };

    const seenFiles = new Set<string>();
    for (const root of present.tasks) {
      for (const file of walkFiles(root, (n) => n === "ui_messages.json", 4)) {
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);
        const f = read(file);
        if (!f) continue;
        for (const e of parseUiMessages(this.name, file, f.raw)) byId.set(e.requestId, e);
      }
    }
    for (const root of present.cli) {
      for (const file of walkFiles(root, (n) => n.endsWith(".messages.json"), 4)) {
        if (seenFiles.has(file)) continue;
        seenFiles.add(file);
        const f = read(file);
        if (!f) continue;
        for (const e of parseClineCliMessages(file, f.raw, f.mtimeMs)) byId.set(e.requestId, e);
      }
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { envDir, isDir } from "./fileutil.js";
import { int, type CopilotRecord } from "./copilot-common.js";
import { desktopDbPath, parseCopilotDesktop } from "./copilot-desktop.js";
import { parseCopilotSessionStore, sessionStorePath, toBurnEvent } from "./copilot-session-store.js";

/**
 * VS Code GitHub Copilot Chat adapter (tokscale copilot_vscode.rs).
 *
 *   <Code user dir>/User/workspaceStorage/<hash>/chatSessions/<uuid>.jsonl
 *
 * where the Code user dir is, exactly as tokscale scans it:
 *   macOS    ~/Library/Application Support/Code
 *   Linux    ~/.config/Code
 *   Windows  %APPDATA%\Code  and  ~/AppData/Roaming/Code
 * BURNLOG_COPILOT_VSCODE_DIR replaces the list with one workspaceStorage dir.
 *
 * Each file is an operation log over one chat session's DOM:
 *   kind 0  {v: {requests: [...]}}          initial snapshot
 *   kind 1  {k: ["requests", i, ...path], v} set a value inside request i
 *   kind 2  {k: ["requests"], v: [...]}     append requests (nested appends
 *                                            like ["requests", i, "response"]
 *                                            carry no usage and are ignored)
 * Replaying it yields per-request usage: `promptTokens` / `completionTokens`
 * (or `result.metadata.promptTokens` / `outputTokens`), the model from
 * `result.metadata.resolvedModel` or a `copilot/`-prefixed `modelId`, and
 * reasoning as the sum of `result.metadata.toolCallRounds[].thinking.tokens`.
 * Requests are pruned to those fields on arrival — prompt and response bodies
 * are dropped immediately and never leave this function. Only requests
 * Copilot served are counted (a resolved model or a `copilot/` modelId).
 * Prompt tokens are reported as fresh input; Copilot Chat logs no cache split.
 *
 * tokscale dedupes this lane against the Copilot CLI stores: a request whose
 * (session id, timestamp) already appears in `~/.copilot/data.db` or
 * `session-store.db` is skipped. That is reproduced here.
 */

type Json = unknown;
type Obj = Record<string, Json>;

const MAX_PATH_ARRAY_INDEX = 4096;

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function workspaceStorageRoots(): string[] {
  const explicit = envDir("BURNLOG_COPILOT_VSCODE_DIR");
  if (explicit) return [explicit];
  const home = homedir();
  const roots = [
    join(home, "Library", "Application Support", "Code", "User", "workspaceStorage"),
    join(home, ".config", "Code", "User", "workspaceStorage"),
  ];
  const appData = envDir("APPDATA");
  if (process.platform === "win32" && appData) roots.push(join(appData, "Code", "User", "workspaceStorage"));
  roots.push(join(home, "AppData", "Roaming", "Code", "User", "workspaceStorage"));
  return roots;
}

export function discoverSessionFiles(): string[] {
  const files = new Set<string>();
  for (const root of workspaceStorageRoots()) {
    let hashes: string[];
    try {
      hashes = readdirSync(root);
    } catch {
      continue;
    }
    for (const h of hashes) {
      const dir = join(root, h, "chatSessions");
      if (!isDir(dir)) continue;
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      for (const n of names) {
        if (!n.endsWith(".jsonl")) continue;
        const p = join(dir, n);
        try {
          if (statSync(p).isFile()) files.add(p);
        } catch {
          // vanished
        }
      }
    }
  }
  return [...files].sort();
}

/** Keep only what `requestToRecord` reads (tokscale `prune_request`). */
function prune(req: Json): void {
  if (!isObj(req)) return;
  for (const k of Object.keys(req)) {
    if (!["promptTokens", "completionTokens", "timestamp", "modelId", "result"].includes(k)) delete req[k];
  }
  const result = req.result;
  if (!isObj(result)) return;
  for (const k of Object.keys(result)) if (k !== "metadata") delete result[k];
  const meta = result.metadata;
  if (!isObj(meta)) return;
  for (const k of Object.keys(meta)) {
    if (!["promptTokens", "outputTokens", "resolvedModel", "toolCallRounds"].includes(k)) delete meta[k];
  }
  const rounds = meta.toolCallRounds;
  if (!Array.isArray(rounds)) return;
  for (const r of rounds) {
    if (!isObj(r)) continue;
    for (const k of Object.keys(r)) if (k !== "thinking") delete r[k];
    if (isObj(r.thinking)) for (const k of Object.keys(r.thinking)) if (k !== "tokens") delete r.thinking[k];
  }
}

const isIndex = (v: Json): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * tokscale `apply_update`: write `value` at `path` inside `target`, creating
 * or overwriting containers on the way. Returns the (possibly replaced) root.
 */
export function applyUpdate(target: Json, path: Json[], value: Json): Json {
  if (path.length === 0) return value;
  const root = { v: target } as Obj;
  let parent: Obj | Json[] = root;
  let slot: string | number = "v";
  const get = (): Json => (parent as Obj)[slot as string];
  const set = (v: Json): void => {
    (parent as Obj)[slot as string] = v;
  };

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const last = i === path.length - 1;
    if (typeof key === "string") {
      if (!isObj(get())) set({});
      const obj = get() as Obj;
      if (last) {
        obj[key] = value;
        break;
      }
      if (!(key in obj)) obj[key] = {};
      parent = obj;
      slot = key;
    } else if (isIndex(key)) {
      if (key > MAX_PATH_ARRAY_INDEX) return root.v;
      if (!Array.isArray(get())) set([]);
      const arr = get() as Json[];
      if (last) {
        if (key < arr.length) arr[key] = value;
        else {
          while (arr.length < key) arr.push(null);
          arr.push(value);
        }
        break;
      }
      while (arr.length <= key) arr.push(null);
      parent = arr;
      slot = key;
    } else {
      return root.v;
    }
  }
  return root.v;
}

function at(v: Json, ...keys: string[]): Json {
  let cur = v;
  for (const k of keys) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function nonEmptyStr(v: Json): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function requestToRecord(req: Json, sessionId: string): CopilotRecord | null {
  const prompt = int(at(req, "promptTokens")) ?? int(at(req, "result", "metadata", "promptTokens")) ?? 0;
  const completion = int(at(req, "completionTokens")) ?? int(at(req, "result", "metadata", "outputTokens")) ?? 0;
  if (prompt === 0 && completion === 0) return null;

  const timestampMs = int(at(req, "timestamp")) ?? 0;
  const resolved = nonEmptyStr(at(req, "result", "metadata", "resolvedModel"));
  const raw = nonEmptyStr(at(req, "modelId"));
  // Only requests Copilot actually served.
  if (!resolved && !raw?.startsWith("copilot/")) return null;
  const model = resolved ?? (raw!.startsWith("copilot/") ? raw!.slice("copilot/".length) : raw!);

  const rounds = at(req, "result", "metadata", "toolCallRounds");
  let reasoning = 0;
  if (Array.isArray(rounds)) for (const r of rounds) reasoning += int(at(r, "thinking", "tokens")) ?? 0;

  return {
    key: `copilot-vscode:${sessionId}:${timestampMs}`,
    sessionId,
    model,
    timestampMs,
    tokens: {
      input: Math.max(0, prompt),
      output: Math.max(0, completion),
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: Math.max(0, reasoning),
    },
  };
}

/** Replay one chat session log into per-request usage records. */
export function parseVscodeSessionFile(path: string): CopilotRecord[] {
  const sessionId = basename(path).replace(/\.jsonl$/, "");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }

  const requests: Json[] = [];
  const addAll = (arr: Json): void => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) {
      prune(r);
      requests.push(r);
    }
  };

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let obj: Obj;
    try {
      const parsed = JSON.parse(t) as Json;
      if (!isObj(parsed)) continue;
      obj = parsed;
    } catch {
      continue;
    }
    const kind = int(obj.kind) ?? -1;
    const k = Array.isArray(obj.k) ? (obj.k as Json[]) : undefined;
    if (kind === 0) {
      addAll(at(obj, "v", "requests"));
    } else if (kind === 1) {
      if (!k || k[0] !== "requests" || !("v" in obj) || !isIndex(k[1])) continue;
      // Out-of-range updates are dropped: padding would mint timestamp-0 requests.
      if (k[1] >= requests.length) continue;
      requests[k[1]] = applyUpdate(requests[k[1]], k.slice(2), obj.v);
      prune(requests[k[1]]);
    } else if (kind === 2) {
      if (k && k.length === 1 && k[0] === "requests") addAll(obj.v);
    }
  }

  const out: CopilotRecord[] = [];
  for (const req of requests) {
    const r = requestToRecord(req, sessionId);
    if (r) out.push(r);
  }
  return out;
}

export class CopilotVscodeAdapter implements Adapter {
  readonly name = "copilot-vscode" as const;

  detect(): boolean {
    return workspaceStorageRoots().some((r) => existsSync(r)) && discoverSessionFiles().length > 0;
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const base = { source: this.name, events: [] as BurnEvent[], scannedFiles: 0, totalLines: 0 };
    const files = discoverSessionFiles();
    if (files.length === 0) {
      const installed = workspaceStorageRoots().some((r) => existsSync(r));
      return { ...base, note: installed ? "VS Code found, but no Copilot Chat sessions" : "not installed" };
    }

    // tokscale's cross-lane dedupe: skip requests the Copilot CLI stores
    // already hold at the same (session, timestamp). Failures here only mean
    // there is nothing to dedupe against.
    const seen = new Set<string>();
    for (const [db, parse] of [
      [desktopDbPath(), parseCopilotDesktop],
      [sessionStorePath(), parseCopilotSessionStore],
    ] as const) {
      if (!existsSync(db)) continue;
      try {
        for (const r of await parse(db)) seen.add(`${r.sessionId}\u0000${r.timestampMs}`);
      } catch {
        // sqlite unavailable or unreadable
      }
    }

    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;
    for (const f of files) {
      let mtime: number;
      try {
        mtime = statSync(f).mtimeMs;
      } catch {
        continue;
      }
      if (!shouldRead(mtime, opts.since)) continue;
      scannedFiles++;
      for (const r of parseVscodeSessionFile(f)) {
        totalLines++;
        if (seen.has(`${r.sessionId}\u0000${r.timestampMs}`)) continue;
        // A request with no timestamp keeps tokscale's key but is dated to
        // when its log was last written rather than 1970.
        const e = toBurnEvent(this.name, r.timestampMs > 0 ? r : { ...r, timestampMs: mtime });
        if (!byId.has(e.requestId)) byId.set(e.requestId, e);
      }
    }
    return { ...base, events: [...byId.values()], scannedFiles, totalLines };
  }
}

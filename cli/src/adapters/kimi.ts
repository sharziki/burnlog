import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import {
  type Buckets,
  EventSet,
  bucketSum,
  collectFiles,
  envPath,
  int,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  notInstalled,
  obj,
  parseJson,
  readLines,
} from "./jsonl-kit.js";

/**
 * Kimi CLI and Kimi Code — both write `wire.jsonl`. Port of tokscale's
 * `sessions/kimi.rs`.
 *
 * Roots (all scanned):
 *   - legacy Kimi CLI: `~/.kimi/sessions/<group>/<session>/wire.jsonl`
 *   - Kimi Code: `$KIMI_CODE_HOME/sessions` (default `~/.kimi-code/sessions`),
 *     `<workspace>/<session>/agents/<agent>/wire.jsonl`
 *   - Kimi Work (desktop; no Linux build): macOS
 *     `~/Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/kimi-code/home/sessions`,
 *     Windows the same under `%APPDATA%` (or the `shareDir` from
 *     `kimi-desktop/daimon-storage.json`).
 *
 * The `agents/` grandparent tells the formats apart.
 *
 * Legacy: `StatusUpdate` messages carry
 * `token_usage: {input_other, output, input_cache_read, input_cache_creation}`
 * (cache-exclusive input) and a `message_id`; the same id can be re-emitted
 * as a turn progresses, and the larger total wins (ties: a real wire
 * timestamp beats the mtime fallback, then the later one). The model is not
 * in the wire — it comes from `~/.kimi/config.json`, else `kimi-for-coding`.
 *
 * Kimi Code: only `usage.record` lines with `usageScope: "turn"` count
 * (`step.end` repeats them; "session" records are bookkeeping). Usage uses
 * camelCase (`inputOther`, `output`, `inputCacheRead`, `inputCacheCreation`).
 * The model is the record's own, else the latest `llm.request`'s; symbolic
 * references like `__kimi_env_model__` are ignored. A paired call is anchored
 * at its request's start time.
 *
 * Override every root with BURNLOG_KIMI_DIR (a directory holding either layout).
 */

const DEFAULT_MODEL = "kimi-for-coding";

function kimiWorkRoots(): string[] {
  const suffix = join("kimi-desktop", "daimon-share", "daimon", "runtime", "kimi-code", "home", "sessions");
  if (process.platform === "darwin") return [join(homedir(), "Library", "Application Support", suffix)];
  if (process.platform === "win32") {
    const roots = [join(homedir(), "AppData", "Roaming", suffix)];
    const appData = envPath("APPDATA");
    if (appData) {
      let shared: string | undefined;
      const cfg = readLines(join(appData, "kimi-desktop", "daimon-storage.json"));
      const shareDir = cfg.length ? parseJson(cfg.join("\n"))?.shareDir : undefined;
      if (typeof shareDir === "string" && shareDir.trim()) {
        shared = join(shareDir, "daimon", "runtime", "kimi-code", "home", "sessions");
      }
      roots.push(shared ?? join(appData, suffix));
    }
    return roots;
  }
  return [];
}

export function kimiRoots(): string[] {
  const explicit = envPath("BURNLOG_KIMI_DIR");
  if (explicit) return [explicit];
  const codeHome = envPath("KIMI_CODE_HOME") ?? join(homedir(), ".kimi-code");
  return [join(homedir(), ".kimi", "sessions"), join(codeHome, "sessions"), ...kimiWorkRoots()];
}

function usageBuckets(u: Record<string, unknown>): Buckets {
  return {
    input: int(u.input_other ?? u.inputOther),
    output: int(u.output),
    cacheRead: int(u.input_cache_read ?? u.inputCacheRead),
    cacheWrite: int(u.input_cache_creation ?? u.inputCacheCreation),
  };
}

function isKimiCodePath(file: string): boolean {
  return basename(dirname(dirname(file))) === "agents";
}

/** `~/.kimi/config.json` `model`, found three levels above the wire file. */
function legacyModel(file: string): string {
  const config = join(dirname(dirname(dirname(dirname(file)))), "config.json");
  const lines = readLines(config);
  const model = lines.length ? parseJson(lines.join("\n"))?.model : undefined;
  return typeof model === "string" && model ? model : DEFAULT_MODEL;
}

function concreteModel(model: unknown): string | undefined {
  if (typeof model !== "string") return undefined;
  let m = model.trim();
  if (m.startsWith("kimi-code/")) m = m.slice("kimi-code/".length);
  m = m.trim();
  const symbolic = m.length >= 4 && m.startsWith("__") && m.endsWith("__");
  return m && !symbolic ? m : undefined;
}

export class KimiAdapter implements Adapter {
  readonly name = "kimi" as const;

  detect(): boolean {
    return kimiRoots().some(isDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles(kimiRoots(), (n) => n === "wire.jsonl", opts);
    if (!anyRoot) return notInstalled(this.name);

    // Legacy message ids are provider completion ids (`chatcmpl-...`), unique
    // across sessions, so the larger-total rule applies across files too.
    const events = new EventSet((a, b) => {
      const ta = bucketSum(tokensOf(a));
      const tb = bucketSum(tokensOf(b));
      return tb !== ta ? tb > ta : b.timestamp >= a.timestamp;
    });
    let totalLines = 0;
    for (const file of files) {
      const lines = readLines(file);
      totalLines += lines.length;
      if (isKimiCodePath(file)) this.parseCode(file, lines, events);
      else this.parseLegacy(file, lines, events);
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }

  private parseLegacy(file: string, lines: string[], events: EventSet): void {
    const model = legacyModel(file);
    const session = basename(dirname(file));
    const fallbackMs = mtimeMs(file);
    // Per file, a mtime-anchored duplicate must not outrank a real timestamp.
    const local = new Map<string, { e: BurnEvent; wire: boolean }>();
    const unkeyed: BurnEvent[] = [];
    let index = 0;
    for (const line of lines) {
      const rec = parseJson(line);
      if (!rec || rec.type === "metadata") continue;
      const msg = obj(rec.message);
      if (!msg || msg.type !== "StatusUpdate") continue;
      const payload = obj(msg.payload);
      const usage = obj(payload?.token_usage);
      if (!payload || !usage) continue;
      const tokens = usageBuckets(usage);
      if (bucketSum(tokens) === 0) continue;

      const wireMs = typeof rec.timestamp === "number" ? Math.trunc(rec.timestamp * 1000) : 0;
      const wire = wireMs > 0;
      const id = typeof payload.message_id === "string" && payload.message_id ? payload.message_id : undefined;
      const key = id ? `kimi:${id}` : `kimi:legacy:${session}:${index}`;
      index++;
      const e = makeEvent(this.name, key, model, mapProvider(undefined, model), tokens, wire ? wireMs : fallbackMs);
      if (!e) continue;
      if (!id) {
        unkeyed.push(e);
        continue;
      }
      const prev = local.get(key);
      if (!prev) {
        local.set(key, { e, wire });
        continue;
      }
      const tp = bucketSum(tokensOf(prev.e));
      const tc = bucketSum(tokens);
      const replace = tc !== tp ? tc > tp : prev.wire !== wire ? wire : e.timestamp >= prev.e.timestamp;
      if (replace) local.set(key, { e, wire });
    }
    for (const { e } of local.values()) events.add(e);
    for (const e of unkeyed) events.add(e);
  }

  private parseCode(file: string, lines: string[], events: EventSet): void {
    // <root>/sessions/<slug>/<session>/agents/<agent>/wire.jsonl
    const agentDir = dirname(file);
    const session = basename(dirname(dirname(agentDir)));
    const agent = basename(agentDir);
    const fallbackMs = mtimeMs(file);
    let latestModel: string | undefined;
    let pendingRequestMs: number | undefined;
    let index = 0;
    for (const line of lines) {
      const rec = parseJson(line);
      if (!rec || typeof rec.type !== "string") continue;
      const time = typeof rec.time === "number" && Number.isInteger(rec.time) && rec.time > 0 ? rec.time : undefined;
      if (rec.type === "llm.request") {
        latestModel = concreteModel(rec.model) ?? latestModel;
        pendingRequestMs = time;
        continue;
      }
      if (rec.type !== "usage.record" || rec.usageScope !== "turn") continue;
      const requestMs = pendingRequestMs;
      pendingRequestMs = undefined;
      const usage = obj(rec.usage);
      if (!usage) continue;
      const tokens = usageBuckets(usage);
      if (bucketSum(tokens) === 0) continue;

      const model = concreteModel(rec.model) ?? latestModel ?? DEFAULT_MODEL;
      const paired = requestMs !== undefined && time !== undefined && time - requestMs > 0;
      const ts = paired ? requestMs : (time ?? fallbackMs);
      // kimi-code records carry no id; position within the agent's wire is stable.
      events.add(makeEvent(this.name, `kimi-code:${session}:${agent}:${index}`, model, mapProvider(undefined, model), tokens, ts));
      index++;
    }
  }
}

function tokensOf(e: BurnEvent): Buckets {
  return { input: e.inputTokens, output: e.outputTokens, cacheRead: e.cacheReadTokens, cacheWrite: e.cacheCreationTokens };
}

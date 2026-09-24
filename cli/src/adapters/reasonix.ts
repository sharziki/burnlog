import { homedir } from "os";
import { basename, isAbsolute, join, resolve } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import {
  EventSet,
  collectFiles,
  envPath,
  isDir,
  makeEvent,
  mapProvider,
  notInstalled,
  parseJson,
  parseTimestampValue,
  readLines,
} from "./jsonl-kit.js";

/**
 * Reasonix — authoritative per-request stats at
 * `<state root>/stats/YYYY-MM-DD.jsonl`. Port of tokscale's
 * `sessions/reasonix.rs`. Session transcripts are NOT read: they lack exact
 * counters and overlap these records.
 *
 * State root: `$REASONIX_STATE_HOME`, else `$REASONIX_HOME` (both with
 * `${VAR}` / `${VAR:-default}` expansion and `~`), else `%APPDATA%\reasonix`
 * on Windows, else `~/.reasonix`.
 *
 * Record: {"ts", "model":"provider/model", "prompt", "completion",
 * "reasoning", "cache_hit", "cache_miss"?, "total", "requests", "turn"}.
 * `turn:true` rows are markers and skipped, as are rows with no total and no
 * requests. Fresh input is `cache_miss` when present and non-zero, else
 * `prompt - cache_hit`. Reasoning is part of `completion` (capped at it), so
 * output is simply `completion`.
 *
 * Key: file name + line index + requests + total, as tokscale.
 *
 * Override the state root with BURNLOG_REASONIX_DIR.
 */

function expandVars(value: string): string {
  return value.replace(/\$\{([^}]*)\}/g, (whole, expr: string) => {
    const at = expr.indexOf(":-");
    const name = at >= 0 ? expr.slice(0, at) : expr;
    const fallback = at >= 0 ? expr.slice(at + 2) : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return whole;
    const v = process.env[name];
    return v ? v : fallback;
  });
}

function cleanEnvDir(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const v = expandVars(raw.trim()).trim();
  if (!v) return undefined;
  let p = v;
  if (v === "~") p = homedir();
  else if (v.startsWith("~/") || v.startsWith("~\\")) p = join(homedir(), v.slice(2));
  return isAbsolute(p) ? p : resolve(p);
}

export function reasonixRoot(): string {
  const explicit = envPath("BURNLOG_REASONIX_DIR");
  if (explicit) return explicit;
  const env = cleanEnvDir("REASONIX_STATE_HOME") ?? cleanEnvDir("REASONIX_HOME");
  if (env) return env;
  if (process.platform === "win32") {
    return join(envPath("APPDATA") ?? join(homedir(), "AppData", "Roaming"), "reasonix");
  }
  return join(homedir(), ".reasonix");
}

function i(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

export class ReasonixAdapter implements Adapter {
  readonly name = "reasonix" as const;

  detect(): boolean {
    return isDir(reasonixRoot());
  }

  scan(opts: ScanOptions = {}): ScanResult {
    if (!this.detect()) return notInstalled(this.name);
    const { files } = collectFiles([join(reasonixRoot(), "stats")], (n) => n.endsWith(".jsonl"), opts);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      // tokscale's lossy reader numbers every line, blank ones included; keys
      // only need to be stable, so numbering kept lines is equivalent.
      readLines(file).forEach((line, index) => {
        totalLines++;
        const r = parseJson(line);
        if (!r || Object.keys(r).some((k) => k.includes("�"))) return;
        if (r.turn === true) return;
        const modelRef = typeof r.model === "string" ? r.model.trim() : "";
        const total = i(r.total);
        const requests = i(r.requests);
        if (!modelRef || (total <= 0 && requests <= 0)) return;
        const ts = parseTimestampValue(r.ts);
        if (ts === undefined) return;

        const slash = modelRef.indexOf("/");
        const providerRef = slash >= 0 ? modelRef.slice(0, slash) : undefined;
        let model = slash >= 0 ? modelRef.slice(slash + 1) : modelRef;
        if (model.includes("�")) model = "unknown";

        const cacheRead = Math.max(0, i(r.cache_hit));
        const prompt = Math.max(0, i(r.prompt));
        const miss = typeof r.cache_miss === "number" ? i(r.cache_miss) : 0;
        const input = miss !== 0 ? Math.max(0, miss) : Math.max(0, prompt - cacheRead);
        const output = Math.max(0, i(r.completion));
        const key = `reasonix:${basename(file)}:${index}:${requests}:${total}`;
        events.add(
          makeEvent(
            this.name,
            key,
            model,
            mapProvider(providerRef && !providerRef.includes("�") ? providerRef : undefined, model),
            { input, output, cacheRead, cacheWrite: 0 },
            ts,
          ),
        );
      });
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

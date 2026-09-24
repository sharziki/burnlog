import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { hashId, num, toMs, walkFiles } from "./fileutil.js";

/**
 * Factory Droid adapter — ported from tokscale's `sessions/droid.rs`.
 *
 * Droid keeps one pair of files per session under `~/.factory/sessions/`
 * (same path on every OS, possibly nested one level per project):
 *
 *   <uuid>.settings.json   { model, providerLock, providerLockTimestamp,
 *                            tokenUsage: { inputTokens, outputTokens,
 *                              cacheCreationTokens, cacheReadTokens,
 *                              thinkingTokens } }
 *   <uuid>.jsonl           the transcript — carries NO token counts
 *
 * `tokenUsage` is the session's CUMULATIVE total, rewritten in place. So this
 * adapter emits one event per session, like the Codex adapter does per
 * rollout. tokscale additionally spreads that total across the transcript's
 * assistant replies by context size to get per-day attribution; that split is
 * an estimate, and its shares shift every time the session grows, which would
 * fight the server's first-write-wins dedupe — so it is not ported.
 *
 * Buckets are Anthropic-style (cache separate from input). Thinking tokens
 * are output.
 *
 * Model: `settings.model`, normalized the way tokscale does
 * ("custom:Claude-Opus-4.5-Thinking-[Anthropic]-0" → "claude-opus-4-5-thinking-0").
 * When absent, tokscale greps the first 500 transcript lines for a
 * "Model: <name> [" system-reminder; only that model name is kept.
 *
 * Timestamp: the settings file's mtime (when the totals were last written),
 * floored at `providerLockTimestamp` — tokscale's `resolve_usage_timestamp`.
 *
 * requestId: sha of the session uuid. Override the root with BURNLOG_DROID_DIR.
 */

type DroidSettings = {
  model?: string;
  providerLock?: string;
  providerLockTimestamp?: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    thinkingTokens?: number;
  };
};

export function normalizeDroidModel(model: string): string {
  let s = model.startsWith("custom:") ? model.slice(7) : model;
  s = s.replace(/\[[^\]]*\]?/g, "");
  s = s.replace(/-+$/, "").toLowerCase().replace(/\./g, "-").replace(/-+/g, "-");
  return s;
}

function defaultModelForProvider(provider: string): string {
  const p = provider.toLowerCase();
  if (p === "anthropic") return "claude-unknown";
  if (p === "openai") return "gpt-unknown";
  if (p === "google" || p === "gemini") return "gemini-unknown";
  if (p === "xai") return "grok-unknown";
  return `${provider || "unknown"}-unknown`;
}

/** Read at most the first 500 lines (and 4 MB) of the transcript for "Model:". */
function modelFromTranscript(jsonl: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(jsonl, "r");
  } catch {
    return undefined;
  }
  try {
    const buf = Buffer.alloc(4 * 1024 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const lines = buf.subarray(0, n).toString("utf8").split("\n").slice(0, 500);
    for (const line of lines) {
      const pos = line.indexOf("Model:");
      if (pos < 0) continue;
      const after = line.slice(pos + 6);
      const m = /^[^[\\"]*/.exec(after)?.[0].trim();
      if (m) return normalizeDroidModel(m);
    }
  } catch {
    // unreadable transcript: fall through to the provider default
  } finally {
    closeSync(fd);
  }
  return undefined;
}

function mapProvider(lock: string | undefined, model: string): BurnEvent["provider"] {
  const p = lock?.toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google") return p;
  return providerFromModel(model);
}

export class DroidAdapter implements Adapter {
  readonly name = "droid" as const;

  private get root(): string {
    return process.env.BURNLOG_DROID_DIR ?? join(homedir(), ".factory", "sessions");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = this.root;
    if (!existsSync(root)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = walkFiles(root, (n) => n.endsWith(".settings.json"));
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;

    for (const file of files) {
      let mtimeMs: number;
      let s: DroidSettings;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        s = JSON.parse(readFileSync(file, "utf8")) as DroidSettings;
      } catch {
        continue;
      }
      scannedFiles++;
      const u = s?.tokenUsage;
      if (!u) continue;

      const input = num(u.inputTokens);
      const output = num(u.outputTokens) + num(u.thinkingTokens);
      const cacheWrite = num(u.cacheCreationTokens);
      const cacheRead = num(u.cacheReadTokens);
      if (input + output + cacheWrite + cacheRead === 0) continue;

      const sessionId = basename(file).slice(0, -".settings.json".length);
      const lock = typeof s.providerLock === "string" ? s.providerLock : undefined;

      let model: string;
      if (typeof s.model === "string" && s.model) {
        model = normalizeDroidModel(s.model);
      } else {
        model =
          modelFromTranscript(file.slice(0, -".settings.json".length) + ".jsonl") ??
          defaultModelForProvider(lock ?? "unknown");
      }

      const lockMs = toMs(s.providerLockTimestamp);
      const ts = Math.max(Math.floor(mtimeMs), lockMs && lockMs > 0 ? lockMs : 0);

      const requestId = hashId("droid", sessionId);
      byId.set(requestId, {
        requestId,
        source: this.name,
        model,
        provider: mapProvider(lock, model),
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: cacheWrite,
        cacheReadTokens: cacheRead,
        timestamp: new Date(ts).toISOString(),
      });
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

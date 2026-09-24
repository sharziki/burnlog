import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import {
  EventSet,
  collectFiles,
  envPath,
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
 * JetBrains Junie — `~/.junie/sessions/<session>/events.jsonl` (every OS).
 * Port of tokscale's `sessions/junie.rs`.
 *
 * Usage lives in `LlmResponseMetadataEvent`s:
 *
 *   {"timestampMs":…, "event":{"agentEvent":{"kind":"LlmResponseMetadataEvent",
 *     "modelUsage":[{"model","provider","inputTokens","outputTokens",
 *                    "cacheInputTokens","cacheCreateTokens","reasoningTokens",
 *                    "cost","time"}]}}}
 *
 * Each modelUsage entry is one row. Field aliases follow tokscale
 * (input/output, cacheReadInputTokens/cacheRead, cacheCreationInputTokens/
 * cacheWrite, reasoningOutputTokens/thinkingTokens); numbers may be strings.
 * tokscale keeps reasoning as its own additive bucket; burnlog folds it into
 * output. `timestampMs` marks the END of the call, so a row with a `time`
 * duration is anchored at its start. Without `timestampMs` the session id
 * (`session-YYMMDD-HHMMSS…`, local time) dates it, else the file mtime.
 *
 * Key: session, timestamp, model, tokens, cost and the entry's index — the
 * same event re-logged dedupes, distinct calls do not.
 *
 * Override the scan root with BURNLOG_JUNIE_DIR.
 */

const USAGE_KIND = "LlmResponseMetadataEvent";

function numberValue(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : undefined;
  if (typeof v === "string") {
    const f = Number.parseFloat(v.trim());
    return Number.isFinite(f) ? Math.max(0, Math.trunc(f)) : undefined;
  }
  return undefined;
}

function firstNumber(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = numberValue(o[k]);
    if (v !== undefined) return v;
  }
  return 0;
}

function floatValue(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const f = Number(v.trim());
    return v.trim() && !Number.isNaN(f) ? f : undefined;
  }
  return undefined;
}

function sessionTimestamp(session: string): number | undefined {
  const m = /^session-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-|$)/.exec(session);
  if (!m) return undefined;
  const [, yy, mo, dd, hh, mi, ss] = m.map(Number);
  const d = new Date(2000 + yy, mo - 1, dd, hh, mi, ss);
  return d.getMonth() === mo - 1 ? d.getTime() : undefined;
}

export class JunieAdapter implements Adapter {
  readonly name = "junie" as const;

  private get root(): string {
    return envPath("BURNLOG_JUNIE_DIR") ?? join(homedir(), ".junie", "sessions");
  }

  detect(): boolean {
    return isDir(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles([this.root], (n) => n === "events.jsonl", opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const session = basename(dirname(file)).trim() || "unknown";
      const defaultMs = sessionTimestamp(session) ?? mtimeMs(file);
      for (const line of readLines(file)) {
        totalLines++;
        if (!line.includes(USAGE_KIND)) continue;
        const rec = parseJson(line);
        const agentEvent = obj(obj(rec?.event)?.agentEvent);
        if (!rec || !agentEvent || agentEvent.kind !== USAGE_KIND) continue;
        const usages = agentEvent.modelUsage;
        if (!Array.isArray(usages)) continue;

        const explicit = numberValue(rec.timestampMs);
        const endMs = explicit !== undefined && explicit > 0 ? explicit : undefined;
        const ts = endMs ?? defaultMs;
        usages.forEach((raw, i) => {
          const u = obj(raw);
          const model = typeof u?.model === "string" ? u.model.trim() : "";
          if (!u || !model) return;
          const input = firstNumber(u, ["inputTokens", "input"]);
          const output = firstNumber(u, ["outputTokens", "output"]);
          const cacheRead = firstNumber(u, ["cacheInputTokens", "cacheReadInputTokens", "cacheRead"]);
          const cacheWrite = firstNumber(u, ["cacheCreateTokens", "cacheCreationInputTokens", "cacheWrite"]);
          const reasoning = firstNumber(u, ["reasoningTokens", "reasoningOutputTokens", "thinkingTokens"]);
          const cost = floatValue(u.cost);
          const costKey = cost !== undefined && Number.isFinite(cost) && cost >= 0 ? cost.toFixed(12) : (0).toFixed(12);
          const key = `junie:${session}:${ts}:${model}:${input}:${output}:${cacheRead}:${cacheWrite}:${reasoning}:${costKey}:${i}`;
          const duration = numberValue(u.time);
          const start = endMs !== undefined && duration !== undefined && duration > 0 ? endMs - duration : ts;
          const provider = typeof u.provider === "string" ? u.provider : undefined;
          events.add(
            makeEvent(
              this.name,
              key,
              model,
              mapProvider(provider, model),
              { input, output: output + reasoning, cacheRead, cacheWrite },
              start,
            ),
          );
        });
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

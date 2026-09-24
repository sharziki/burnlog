import { homedir } from "os";
import { basename, join } from "path";
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
  parseJson,
  parseTimestampValue,
  readLines,
} from "./jsonl-kit.js";

/**
 * OpenCodeReview — `~/.opencodereview/sessions/<encoded-repo>/<session>.jsonl`
 * (every OS). Port of tokscale's `sessions/opencodereview.rs`.
 *
 * `llm_response` records carry OpenAI-style usage:
 *   {"type":"llm_response","model":…,"timestamp":…,"duration_ms":…,
 *    "usage":{"prompt_tokens","completion_tokens","cache_read_tokens","cache_write_tokens"}}
 * tokscale takes prompt_tokens as the input bucket as-is; so does burnlog.
 * The timestamp marks the response's end, so a record with a duration is
 * anchored at its start.
 *
 * Key: session + recorded timestamp + model + tokens (plus the line number
 * when the record has no timestamp), deduped within the file.
 *
 * Override the scan root with BURNLOG_OPENCODEREVIEW_DIR.
 */

function n(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export class OpencodereviewAdapter implements Adapter {
  readonly name = "opencodereview" as const;

  private get root(): string {
    return envPath("BURNLOG_OPENCODEREVIEW_DIR") ?? join(homedir(), ".opencodereview", "sessions");
  }

  detect(): boolean {
    return isDir(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles([this.root], (f) => f.endsWith(".jsonl"), opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const session = basename(file, ".jsonl").trim() || "unknown";
      const fallbackMs = mtimeMs(file);
      readLines(file).forEach((line, lineIndex) => {
        totalLines++;
        if (!line.includes("llm_response")) return;
        const rec = parseJson(line);
        if (!rec || rec.type !== "llm_response") return;
        const u = rec.usage as Record<string, unknown> | undefined;
        if (!u || typeof u !== "object") return;
        const b = {
          input: n(u.prompt_tokens),
          output: n(u.completion_tokens),
          cacheRead: n(u.cache_read_tokens),
          cacheWrite: n(u.cache_write_tokens),
        };
        const explicit = parseTimestampValue(rec.timestamp);
        const model = typeof rec.model === "string" ? rec.model : "unknown";
        const duration = typeof rec.duration_ms === "number" && rec.duration_ms > 0 ? Math.trunc(rec.duration_ms) : undefined;
        const ts = explicit !== undefined && duration !== undefined ? explicit - duration : fallbackMs;
        const disc = explicit === undefined ? `:line${lineIndex}` : "";
        const key = `opencodereview:${session}:${explicit ?? "none"}:${model}:${b.input}:${b.output}:${b.cacheRead}:${b.cacheWrite}${disc}`;
        events.add(makeEvent(this.name, key, model, mapProvider(undefined, model), b, ts));
      });
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import {
  EventSet,
  collectFiles,
  envPath,
  int,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  nonEmpty,
  notInstalled,
  obj,
  parseJson,
  parseTimestampStr,
  readLines,
} from "./jsonl-kit.js";

/**
 * Qwen CLI — `~/.qwen/projects/<project>/chats/<session>.jsonl` (same path on
 * every OS). Port of tokscale's `sessions/qwen.rs`.
 *
 * Assistant lines carry Gemini-style usage:
 *
 *   {"type":"assistant","model":"qwen3.5-plus","timestamp":"...","sessionId":"...",
 *    "usageMetadata":{"promptTokenCount","candidatesTokenCount",
 *                     "thoughtsTokenCount","cachedContentTokenCount"}}
 *
 * tokscale reads promptTokenCount as input as-is (Qwen's records show cached
 * counts larger than the prompt count, so it is not cache-inclusive) and keeps
 * thoughts as a separate bucket; burnlog folds thoughts into output. No cache
 * write is reported.
 *
 * Lines have no per-message id, so the key is the message's position in its
 * session (`<session>:<n>`), as in tokscale. A missing sessionId falls back to
 * `<project dir>-<file stem>`, hashed like every other key.
 *
 * Override the scan root with BURNLOG_QWEN_DIR.
 */
export class QwenAdapter implements Adapter {
  readonly name = "qwen" as const;

  private get root(): string {
    return envPath("BURNLOG_QWEN_DIR") ?? join(homedir(), ".qwen", "projects");
  }

  detect(): boolean {
    return isDir(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles([this.root], (n) => n.endsWith(".jsonl"), opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const fallbackMs = mtimeMs(file);
      const pathSession = `${basename(dirname(dirname(file)))}-${basename(file, ".jsonl")}`;
      let index = 0;
      for (const line of readLines(file)) {
        totalLines++;
        const rec = parseJson(line);
        if (!rec || rec.type !== "assistant") continue;
        const u = obj(rec.usageMetadata);
        if (!u) continue;
        const input = int(u.promptTokenCount);
        const output = int(u.candidatesTokenCount);
        const thoughts = int(u.thoughtsTokenCount);
        const cacheRead = int(u.cachedContentTokenCount);
        if (input + output + thoughts + cacheRead === 0) continue;

        const model = typeof rec.model === "string" ? rec.model : "unknown";
        const session = nonEmpty(rec.sessionId) ?? pathSession;
        const ts = typeof rec.timestamp === "string" ? parseTimestampStr(rec.timestamp) : undefined;
        events.add(
          makeEvent(
            this.name,
            `qwen:${session}:${index}`,
            model,
            mapProvider(undefined, model),
            { input, output: output + thoughts, cacheRead, cacheWrite: 0 },
            ts ?? fallbackMs,
          ),
        );
        index++;
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

import { homedir } from "os";
import { join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
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
  nonEmpty,
  notInstalled,
  obj,
  parseJson,
  readLines,
} from "./jsonl-kit.js";

/**
 * MiniMax Code (`mcode`) headless streams. Port of tokscale's
 * `sessions/mcode.rs`.
 *
 * mcode keeps no local usage history of its own. These files exist when a
 * run's `mcode exec --output-format stream-json` output was captured by
 * tokscale's headless wrapper into `<headless root>/mcode/*.jsonl`, where the
 * headless root is `$TOKSCALE_HEADLESS_DIR`, else `~/.config/tokscale/headless`
 * and `~/Library/Application Support/tokscale/headless` (tokscale checks both
 * on every OS). Any other capture of the same stream can be pointed at with
 * BURNLOG_MCODE_DIR.
 *
 * Two shapes:
 *   - legacy: assistant `message` events with `message.turnId` and
 *     `message.usage`, attributed when the turn's `exec.result` names the
 *     model (`model: {providerId, modelId}`);
 *   - envelope: `exec.completed` with `result.usage` and `result.model`.
 * Usage: {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}.
 * A stream with no model-bearing result is ignored rather than guessed at.
 *
 * Key: session + turn + index within the turn + tokens.
 */

function tokens(u: Record<string, unknown>): Buckets {
  return {
    input: int(u.inputTokens),
    output: int(u.outputTokens),
    cacheRead: int(u.cacheReadTokens),
    cacheWrite: int(u.cacheWriteTokens),
  };
}

function normalizeTs(t: number): number {
  return t > 0 && t < 10_000_000_000 ? t * 1000 : t;
}

export function mcodeRoots(): string[] {
  const explicit = envPath("BURNLOG_MCODE_DIR");
  if (explicit) return [explicit];
  const headless = process.env.TOKSCALE_HEADLESS_DIR;
  const roots = headless
    ? [headless]
    : [
        join(homedir(), ".config", "tokscale", "headless"),
        join(homedir(), "Library", "Application Support", "tokscale", "headless"),
      ];
  return roots.map((r) => join(r, "mcode"));
}

export class McodeAdapter implements Adapter {
  readonly name = "mcode" as const;

  detect(): boolean {
    return mcodeRoots().some(isDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles(mcodeRoots(), (n) => n.endsWith(".jsonl"), opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const fallbackMs = mtimeMs(file);
      const pending = new Map<string, Array<{ ts: number; b: Buckets }>>();
      for (const line of readLines(file)) {
        totalLines++;
        const rec = parseJson(line);
        if (!rec) continue;
        const type = rec.type;
        if (type === "message") {
          const msg = obj(rec.message);
          if (!msg || msg.role !== "assistant") continue;
          const turn = nonEmpty(msg.turnId);
          const usage = obj(msg.usage);
          if (!turn || !usage) continue;
          const b = tokens(usage);
          if (bucketSum(b) === 0) continue;
          const ts = normalizeTs(typeof msg.timestamp === "number" ? Math.trunc(msg.timestamp) : fallbackMs);
          if (ts <= 0) continue;
          const list = pending.get(turn) ?? [];
          list.push({ ts, b });
          pending.set(turn, list);
        } else if (type === "exec.result" || type === "exec.completed") {
          const turn = nonEmpty(rec.turnId);
          const session = nonEmpty(rec.sessionId);
          if (!turn || !session) continue;
          const result = type === "exec.completed" ? obj(rec.result) : rec;
          const model = obj(result?.model);
          const providerId = nonEmpty(model?.providerId);
          const modelId = nonEmpty(model?.modelId);
          if (!result || !providerId || !modelId) continue;

          let usages: Array<{ ts: number; b: Buckets }>;
          if (type === "exec.completed") {
            const usage = obj(result.usage);
            if (!usage) continue;
            const b = tokens(usage);
            if (bucketSum(b) === 0) continue;
            const ts = normalizeTs(typeof rec.timestampMs === "number" ? Math.trunc(rec.timestampMs) : fallbackMs);
            if (ts <= 0) continue;
            usages = [{ ts, b }];
          } else {
            const list = pending.get(turn);
            if (!list) continue;
            pending.delete(turn);
            usages = list;
          }
          usages.forEach(({ ts, b }, index) => {
            const key = `mcode:${session}:${turn}:${index}:${b.input}:${b.output}:${b.cacheRead}:${b.cacheWrite}`;
            events.add(makeEvent(this.name, key, modelId, mapProvider(providerId, modelId), b, ts));
          });
        }
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

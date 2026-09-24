import { existsSync, readFileSync, statSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, num, toMs, walkFiles } from "./fileutil.js";

/**
 * Augment Code (Auggie CLI) adapter — ported from tokscale's
 * `sessions/augment.rs`.
 *
 * Auggie keeps one JSON snapshot per session:
 *
 *   ~/.augment/sessions/<sessionId>.json      (same path on every OS)
 *
 *   {
 *     sessionId, agentState: { modelId },
 *     chatHistory: [{
 *       completed, finishedAt, sequenceId,
 *       exchange: { model_id, request_id, response_nodes: [{ token_usage }] }
 *     }]
 *   }
 *
 * `token_usage` is Anthropic-shaped (input_tokens, output_tokens,
 * cache_read_input_tokens, cache_creation_input_tokens) with input and cache
 * reported as SEPARATE buckets — nothing is subtracted. One event per
 * completed turn; the last non-empty usage node wins (never summed, in case
 * a turn repeats cumulative totals). Incomplete/aborted turns are skipped
 * even if a partial usage was already streamed. Auggie stores only
 * `finishedAt`, so timestamps are end-anchored, falling back to file mtime.
 *
 * Dedupe key mirrors tokscale: session + request_id, else sequenceId, else
 * turn index — hashed, since the session id can fall back to the filename.
 *
 * Override the scan root with BURNLOG_AUGMENT_DIR.
 */

type Usage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
};

type Turn = {
  completed?: unknown;
  finishedAt?: unknown;
  sequenceId?: unknown;
  exchange?: {
    model_id?: unknown;
    request_id?: unknown;
    response_nodes?: Array<{ token_usage?: Usage | null } | null>;
  } | null;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function breakdown(u: Usage) {
  return {
    input: num(u.input_tokens),
    output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens),
    cacheWrite: num(u.cache_creation_input_tokens),
  };
}

export class AugmentAdapter implements Adapter {
  readonly name = "augment" as const;

  private get root(): string {
    return envDir("BURNLOG_AUGMENT_DIR") ?? join(homedir(), ".augment", "sessions");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const byKey = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const file of walkFiles(this.root, (n) => n.endsWith(".json"))) {
      let mtimeMs: number;
      let raw: string;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        raw = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;

      let session: { sessionId?: unknown; agentState?: { modelId?: unknown } | null; chatHistory?: unknown };
      try {
        session = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!session || typeof session !== "object") continue;

      const sessionId = str(session.sessionId) ?? basename(file, ".json");
      if (!sessionId) continue;
      const defaultModel = str(session.agentState?.modelId) ?? "unknown";
      const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];

      history.forEach((t: unknown, index: number) => {
        totalLines++;
        if (!t || typeof t !== "object" || Array.isArray(t)) return;
        const turn = t as Turn;
        if (turn.completed !== true) return;
        const exchange = turn.exchange;
        if (!exchange || typeof exchange !== "object") return;
        const nodes = Array.isArray(exchange.response_nodes) ? exchange.response_nodes : [];

        let usage: ReturnType<typeof breakdown> | undefined;
        for (let i = nodes.length - 1; i >= 0; i--) {
          const u = nodes[i]?.token_usage;
          if (!u || typeof u !== "object") continue;
          const b = breakdown(u);
          if (b.input + b.output + b.cacheRead + b.cacheWrite > 0) {
            usage = b;
            break;
          }
        }
        if (!usage) return;

        const model = str(exchange.model_id) ?? defaultModel;
        const timestamp = toMs(turn.finishedAt) ?? mtimeMs;

        let key: string;
        const requestId = str(exchange.request_id);
        const seq =
          turn.sequenceId === undefined || turn.sequenceId === null
            ? ""
            : typeof turn.sequenceId === "string"
              ? turn.sequenceId
              : JSON.stringify(turn.sequenceId);
        if (requestId) key = `augment:${sessionId}:req:${requestId}`;
        else if (seq) key = `augment:${sessionId}:seq:${seq}`;
        else key = `augment:${sessionId}:turn:${index}`;

        const requestIdHash = hashId(key);
        if (byKey.has(requestIdHash)) return;
        byKey.set(requestIdHash, {
          requestId: requestIdHash,
          source: this.name,
          model,
          provider: providerFromModel(model),
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheCreationTokens: usage.cacheWrite,
          cacheReadTokens: usage.cacheRead,
          timestamp: new Date(timestamp).toISOString(),
        });
      });
    }

    return { source: this.name, events: [...byKey.values()], scannedFiles, totalLines };
  }
}

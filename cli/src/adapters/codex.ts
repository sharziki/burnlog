import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanResult } from "./types.js";
import { providerFromModel } from "./types.js";

/**
 * OpenAI Codex CLI — `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
 *
 * Each session file is a JSONL stream. Relevant event shapes:
 *   { type: "session_meta", payload: { id, cwd, cli_version, ... } }
 *   { type: "turn_context", payload: { model, ... } }
 *   { type: "event_msg",    payload: { type: "token_count", info: {...} } }
 *
 * A `token_count.info` object looks like:
 *   {
 *     total_token_usage: { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens },
 *     last_token_usage:  { ... same shape ... },
 *     model_context_window: number
 *   }
 *
 * The file is append-only, so `total_token_usage` grows over the session. We
 * only read the LAST token_count in each file and record a single BurnEvent
 * per session, keyed by session_meta.id. Output_tokens on the event is the
 * session total.
 */
type CodexLine = {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
};

type CodexTokenUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
};

export class CodexAdapter implements Adapter {
  readonly name = "codex" as const;

  private get root(): string {
    return process.env.BURNLOG_CODEX_DIR ?? join(homedir(), ".codex", "sessions");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(): ScanResult {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = this.walk(this.root).filter((f) => f.endsWith(".jsonl"));
    const events: BurnEvent[] = [];
    let totalLines = 0;

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      let sessionId: string | undefined;
      let sessionStart: string | undefined;
      let model: string | undefined;
      let lastUsage: CodexTokenUsage | undefined;
      let lastTimestamp: string | undefined;

      for (const line of content.split("\n")) {
        if (!line) continue;
        totalLines++;
        let obj: CodexLine;
        try {
          obj = JSON.parse(line) as CodexLine;
        } catch {
          continue;
        }

        if (obj.type === "session_meta") {
          const p = obj.payload as { id?: string; timestamp?: string } | undefined;
          sessionId = p?.id ?? sessionId;
          sessionStart = p?.timestamp ?? sessionStart;
        } else if (obj.type === "turn_context") {
          const p = obj.payload as { model?: string } | undefined;
          if (p?.model) model = p.model;
        } else if (obj.type === "event_msg") {
          const p = obj.payload as
            | { type?: string; info?: { total_token_usage?: CodexTokenUsage } | null }
            | undefined;
          if (p?.type === "token_count" && p.info && p.info.total_token_usage) {
            lastUsage = p.info.total_token_usage;
            if (obj.timestamp) lastTimestamp = obj.timestamp;
          }
        }
      }

      if (!sessionId || !lastUsage) continue;
      const input = lastUsage.input_tokens ?? 0;
      const cached = lastUsage.cached_input_tokens ?? 0;
      const output = lastUsage.output_tokens ?? 0;
      const reasoning = lastUsage.reasoning_output_tokens ?? 0;
      if (input + output + reasoning + cached === 0) continue;

      const modelName = model ?? "gpt-codex";
      events.push({
        requestId: sessionId,
        source: this.name,
        model: modelName,
        provider: providerFromModel(modelName),
        inputTokens: input,
        outputTokens: output + reasoning,
        cacheCreationTokens: 0,
        cacheReadTokens: cached,
        timestamp: lastTimestamp ?? sessionStart ?? new Date().toISOString(),
      });
    }

    return {
      source: this.name,
      events,
      scannedFiles: files.length,
      totalLines,
    };
  }

  private walk(dir: string): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) out.push(...this.walk(full));
      else if (s.isFile()) out.push(full);
    }
    return out;
  }
}

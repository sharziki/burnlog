import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanResult } from "./types.js";
import { providerFromModel } from "./types.js";

type ClaudeLine = {
  type?: string;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  requestId?: string;
  timestamp?: string;
};

export class ClaudeCodeAdapter implements Adapter {
  readonly name = "claude-code" as const;

  private get root(): string {
    return process.env.BURNLOG_CLAUDE_DIR ?? join(homedir(), ".claude", "projects");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(): ScanResult {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    // Dedupe: a single request may appear multiple times in jsonl (split by
    // content block). Keep the entry with the highest output_tokens.
    const byRequest = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.root);
    } catch {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "unreadable" };
    }

    for (const entry of projectDirs) {
      const dir = join(this.root, entry);
      let s;
      try {
        s = statSync(dir);
      } catch {
        continue;
      }
      if (!s.isDirectory()) continue;

      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const file of files) {
        let content: string;
        try {
          content = readFileSync(join(dir, file), "utf8");
        } catch {
          continue;
        }
        scannedFiles++;
        for (const line of content.split("\n")) {
          if (!line) continue;
          totalLines++;
          let obj: ClaudeLine;
          try {
            obj = JSON.parse(line) as ClaudeLine;
          } catch {
            continue;
          }
          if (obj.type !== "assistant") continue;
          const msg = obj.message;
          const u = msg?.usage;
          if (!u) continue;
          const requestId = obj.requestId ?? msg?.id;
          if (!requestId || !obj.timestamp) continue;
          const model = msg?.model ?? "unknown";
          const event: BurnEvent = {
            requestId,
            source: this.name,
            model,
            provider: providerFromModel(model),
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            timestamp: obj.timestamp,
          };
          const existing = byRequest.get(requestId);
          if (!existing || event.outputTokens > existing.outputTokens) {
            byRequest.set(requestId, event);
          }
        }
      }
    }

    return {
      source: this.name,
      events: [...byRequest.values()],
      scannedFiles,
      totalLines,
    };
  }
}

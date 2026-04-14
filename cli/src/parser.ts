import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

export type BurnEvent = {
  requestId: string;
  sessionId: string;
  project: string;
  model: string;
  provider: "anthropic" | "openai" | "google";
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  timestamp: string;
};

type ClaudeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type ClaudeLine = {
  type?: string;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    usage?: ClaudeUsage;
  };
  requestId?: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
};

function decodeProjectDir(name: string): string {
  // Claude Code encodes /home/user/foo as -home-user-foo.
  // Leading dash becomes leading slash.
  if (name.startsWith("-")) return "/" + name.slice(1).replace(/-/g, "/");
  return name;
}

function providerFromModel(model: string): "anthropic" | "openai" | "google" {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) return "openai";
  if (m.includes("gemini")) return "google";
  return "anthropic";
}

export type ParseResult = {
  events: BurnEvent[];
  scannedFiles: number;
  totalLines: number;
  dedupedRequests: number;
};

export function parseClaudeProjects(
  claudeProjectsDir: string,
  opts: { sinceMs?: number } = {},
): ParseResult {
  let entries: string[] = [];
  try {
    entries = readdirSync(claudeProjectsDir);
  } catch {
    return { events: [], scannedFiles: 0, totalLines: 0, dedupedRequests: 0 };
  }

  // dedupe: each requestId keeps the max-usage seen (claude code may split a
  // single request across multiple jsonl lines; they share requestId and have
  // the same usage object repeated).
  const byRequest = new Map<string, BurnEvent>();
  let scannedFiles = 0;
  let totalLines = 0;

  for (const entry of entries) {
    const projectDir = join(claudeProjectsDir, entry);
    let stat;
    try {
      stat = statSync(projectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const project = decodeProjectDir(entry);
    let files: string[] = [];
    try {
      files = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(projectDir, file);
      let content: string;
      try {
        content = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;
      const lines = content.split("\n");
      for (const line of lines) {
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
        if (!msg?.usage) continue;
        const requestId = obj.requestId ?? msg.id;
        if (!requestId) continue;
        const ts = obj.timestamp;
        if (!ts) continue;
        if (opts.sinceMs && new Date(ts).getTime() < opts.sinceMs) continue;

        const u = msg.usage;
        const model = msg.model ?? "unknown";
        const event: BurnEvent = {
          requestId,
          sessionId: obj.sessionId ?? "unknown",
          project: obj.cwd ?? project,
          model,
          provider: providerFromModel(model),
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          timestamp: ts,
        };
        // If we've seen this requestId, keep the one with more output tokens
        // (the "final" write often has the full count).
        const existing = byRequest.get(requestId);
        if (!existing || event.outputTokens > existing.outputTokens) {
          byRequest.set(requestId, event);
        }
      }
    }
  }

  return {
    events: [...byRequest.values()],
    scannedFiles,
    totalLines,
    dedupedRequests: byRequest.size,
  };
}

export function totalTokens(e: BurnEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

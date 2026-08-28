import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";

/**
 * opencode adapter.
 *
 * opencode writes one JSON file per message under its XDG data directory:
 *
 *   ~/.local/share/opencode/storage/message/<sessionID>/<messageID>.json
 *
 * Older installs (before opencode's storage migration) nest it one level
 * deeper as `storage/session/message/<sessionID>/...`, so both layouts are
 * walked — someone who has been using opencode for months is exactly the
 * person whose history is worth reading, and they are the most likely to have
 * files written by an older version.
 *
 * Assistant messages carry the usage block this adapter exists for
 * (packages/schema/src/session-message.ts, `Session.Message.Assistant`):
 *
 *   tokens: { input, output, reasoning, cache: { read, write } }
 *   time:   { created, completed? }        // epoch milliseconds
 *
 * The model reference moved. It used to be flat `modelID` / `providerID`
 * fields; current builds nest it as `model: { id, providerID }`. Both are
 * read, because a long-lived storage directory contains both.
 *
 * Override the scan root with BURNLOG_OPENCODE_DIR.
 */

type OpencodeTokens = {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
};

type OpencodeMessage = {
  id?: string;
  role?: string;
  type?: string;
  // Current shape.
  model?: { id?: string; providerID?: string };
  // Legacy flat shape.
  modelID?: string;
  providerID?: string;
  tokens?: OpencodeTokens;
  time?: { created?: number; completed?: number };
};

function candidateRoots(): string[] {
  const explicit = process.env.BURNLOG_OPENCODE_DIR;
  if (explicit) return [explicit];

  const home = homedir();
  const xdg = process.env.XDG_DATA_HOME;
  return [
    ...(xdg ? [join(xdg, "opencode")] : []),
    join(home, ".local", "share", "opencode"),
    // macOS builds that resolve XDG through env-paths land here instead.
    join(home, "Library", "Application Support", "opencode"),
  ];
}

/** Directories that may hold `<sessionID>/<messageID>.json`. */
function messageDirs(root: string): string[] {
  return [
    join(root, "storage", "message"),
    join(root, "storage", "session", "message"),
  ].filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export class OpencodeAdapter implements Adapter {
  readonly name = "opencode" as const;

  private get root(): string | null {
    return candidateRoots().find((r) => existsSync(r)) ?? null;
  }

  detect(): boolean {
    return this.root !== null;
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = this.root;
    if (!root) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const dirs = messageDirs(root);
    if (dirs.length === 0) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "installed, but no message storage yet — run an opencode session first",
      };
    }

    // Keyed by message id: opencode rewrites a message file as the turn
    // streams, so the same id can be seen more than once across layouts. The
    // richest version wins, matching how the Claude Code adapter resolves
    // duplicate requestIds.
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const dir of dirs) {
      let sessions: string[] = [];
      try {
        sessions = readdirSync(dir);
      } catch {
        continue;
      }

      for (const session of sessions) {
        const sessionDir = join(dir, session);
        let files: string[] = [];
        try {
          if (!statSync(sessionDir).isDirectory()) continue;
          files = readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
        } catch {
          continue;
        }

        for (const file of files) {
          const full = join(sessionDir, file);
          let raw: string;
          try {
            if (!shouldRead(statSync(full).mtimeMs, opts.since)) continue;
            raw = readFileSync(full, "utf8");
          } catch {
            continue;
          }
          scannedFiles++;
          totalLines++;

          let msg: OpencodeMessage;
          try {
            msg = JSON.parse(raw) as OpencodeMessage;
          } catch {
            continue;
          }

          // Only assistant turns carry usage. `role` is the legacy field name,
          // `type` the current one.
          if (msg.role !== "assistant" && msg.type !== "assistant") continue;

          const t = msg.tokens;
          if (!t) continue;

          const created = msg.time?.created;
          if (!msg.id || typeof created !== "number" || !Number.isFinite(created)) continue;

          const input = num(t.input);
          // Reasoning tokens are billed and emitted as output; opencode just
          // reports them in their own field.
          const output = num(t.output) + num(t.reasoning);
          const cacheCreationTokens = num(t.cache?.write);
          const cacheReadTokens = num(t.cache?.read);
          if (input + output + cacheCreationTokens + cacheReadTokens === 0) continue;

          const model = msg.model?.id ?? msg.modelID ?? "unknown";
          const providerId = msg.model?.providerID ?? msg.providerID;

          const event: BurnEvent = {
            requestId: msg.id,
            source: this.name,
            model,
            // opencode names the provider outright, so trust it when it maps
            // onto one we store and fall back to the model-name heuristic
            // every other adapter uses when it doesn't.
            provider:
              providerId === "anthropic" || providerId === "openai" || providerId === "google"
                ? providerId
                : providerFromModel(model),
            inputTokens: input,
            outputTokens: output,
            cacheCreationTokens,
            cacheReadTokens,
            timestamp: new Date(created).toISOString(),
          };

          const existing = byId.get(event.requestId);
          if (!existing || event.outputTokens > existing.outputTokens) {
            byId.set(event.requestId, event);
          }
        }
      }
    }

    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles,
      totalLines,
    };
  }
}

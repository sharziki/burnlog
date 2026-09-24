import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { hashId } from "./fileutil.js";
import {
  chatContext,
  chatFiles,
  chatIdToMs,
  extractAssistantUsage,
  hasSignal,
  isAssistant,
  manicodeProjectRoots,
  mapProvider,
  messageTimestamp,
} from "./codebuff.js";

/**
 * Freebuff adapter — ported from tokscale's `sessions/freebuff.rs`.
 *
 * Freebuff is Codebuff compiled in free mode: same `~/.config/manicode*`
 * tree, same `chat-messages.json` (see codebuff.ts). A chat is Freebuff's
 * only on a positive marker — some message's
 * `metadata.runState.sessionState.mainAgentState.agentType` starts with
 * `base2-free` — and only when it records no real usage (a chat with real
 * usage belongs to the codebuff adapter, so the two never double count).
 *
 * Freebuff stores NO token counts. Like tokscale, tokens are ESTIMATED at
 * ceil(chars / 4): output from each assistant reply's text, input from the
 * user/tool text that arrived since the previous reply. Only the character
 * counts are computed; no text is kept. The model comes from the channel
 * root's `settings.json` (`freebuffModel`), else "freebuff-unknown".
 *
 * Roots: FREEBUFF_DATA_DIR, else CODEBUFF_DATA_DIR, else the three channel
 * roots. BURNLOG_FREEBUFF_DIR points straight at a `projects` directory.
 *
 * requestId: sha of (chat context, assistant index).
 */

type J = Record<string, unknown>;
const obj = (v: unknown): J | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : undefined);

const estimate = (chars: number): number => Math.ceil(chars / 4);

function rootAgentId(msg: J): string | undefined {
  const t = obj(obj(obj(obj(msg.metadata)?.runState)?.sessionState)?.mainAgentState)?.agentType;
  return typeof t === "string" && t.trim() ? t : undefined;
}

/** Characters of message text (Unicode code points, like Rust's chars()). */
function textChars(msg: J): number {
  let n = 0;
  if (typeof msg.content === "string") n += [...msg.content].length;
  if (Array.isArray(msg.blocks)) {
    for (const b of msg.blocks) {
      const c = obj(b)?.content;
      if (typeof c === "string") n += [...c].length;
    }
  }
  return n;
}

function modelFromSettings(file: string): string | undefined {
  // chat-messages.json → <chatId> → chats → <project> → projects → channel root
  const channelRoot = dirname(dirname(dirname(dirname(dirname(file)))));
  try {
    const v = JSON.parse(readFileSync(join(channelRoot, "settings.json"), "utf8")) as J;
    const m = v?.freebuffModel;
    return typeof m === "string" && m.trim() ? m : undefined;
  } catch {
    return undefined;
  }
}

export function parseFreebuffChat(file: string, messages: unknown[], mtimeMs: number): BurnEvent[] {
  const msgs = messages.map(obj).filter((m): m is J => !!m);
  if (!msgs.some((m) => rootAgentId(m)?.startsWith("base2-free"))) return [];
  if (msgs.some((m) => isAssistant(m) && hasSignal(extractAssistantUsage(m)))) return [];

  const { channel, project, chatId } = chatContext(file);
  const sessionId = `${channel}/${project}/${chatId}`;
  const chatTs = chatIdToMs(chatId);
  const model = modelFromSettings(file) ?? "freebuff-unknown";

  const out: BurnEvent[] = [];
  let turnInputChars = 0;
  let index = 0;
  for (const msg of msgs) {
    const chars = textChars(msg);
    if (!isAssistant(msg)) {
      turnInputChars += chars;
      continue;
    }
    if (chars === 0) continue;
    const input = estimate(turnInputChars);
    const output = estimate(chars);
    turnInputChars = 0;
    const ts = messageTimestamp(msg) ?? chatTs ?? Math.floor(mtimeMs);
    out.push({
      requestId: hashId("freebuff", sessionId, index++),
      source: "freebuff",
      model,
      provider: mapProvider(model),
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      timestamp: new Date(ts).toISOString(),
    });
  }
  return out;
}

export class FreebuffAdapter implements Adapter {
  readonly name = "freebuff" as const;

  private roots(): string[] {
    return manicodeProjectRoots("FREEBUFF_DATA_DIR", "BURNLOG_FREEBUFF_DIR", "CODEBUFF_DATA_DIR");
  }

  detect(): boolean {
    return this.roots().some((r) => existsSync(r));
  }

  scan(opts: ScanOptions = {}): ScanResult {
    if (!this.detect()) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    for (const file of chatFiles(this.roots())) {
      let mtimeMs: number;
      let messages: unknown;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        messages = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      scannedFiles++;
      if (!Array.isArray(messages)) continue;
      for (const e of parseFreebuffChat(file, messages, mtimeMs)) byId.set(e.requestId, e);
    }
    return {
      source: this.name,
      events: [...byId.values()],
      scannedFiles,
      totalLines: scannedFiles,
      note: byId.size ? "estimated from message length (Freebuff stores no token counts)" : undefined,
    };
  }
}

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { hashId, num, toMs, walkFiles, xdgData } from "./fileutil.js";

/**
 * Amp (Sourcegraph) adapter — ported from tokscale's `sessions/amp.rs`.
 *
 * Amp writes one JSON file per thread:
 *
 *   $XDG_DATA_HOME/amp/threads/T-<uuid>.json   (default ~/.local/share/amp/threads)
 *
 * tokscale uses the same XDG path on every OS, and so does this adapter.
 *
 * A thread carries usage in two places that OVERLAP:
 *
 *   usageLedger.events[]  { timestamp, model, credits, tokens: { input, output,
 *                           cacheReadInputTokens, cacheCreationInputTokens },
 *                           toMessageId }
 *   messages[]            assistant messages with usage: { model, inputTokens,
 *                           outputTokens, cacheReadInputTokens,
 *                           cacheCreationInputTokens, credits }, messageId
 *
 * The ledger is authoritative but can be partial, so — like tokscale — each
 * assistant message is matched to a ledger event (first by `toMessageId`, then
 * by identical model + tokens, scanning forward from the last match) and only
 * the unmatched messages are added. Counting both would double every call.
 *
 * Buckets are Anthropic-style: input excludes cache reads/writes.
 *
 * requestId: sha of (thread id, message id) when a message is involved, else
 * (thread id, ledger index) — stable across re-scans, and opaque.
 *
 * Override the scan root with BURNLOG_AMP_DIR (the `threads` directory).
 */

type AmpTokens = {
  input?: number;
  output?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

type AmpThread = {
  id?: string;
  created?: number;
  messages?: Array<{
    role?: string;
    messageId?: number;
    usage?: {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    };
  }>;
  usageLedger?: {
    events?: Array<{
      timestamp?: string;
      model?: string;
      tokens?: AmpTokens;
      toMessageId?: number;
    }>;
  };
};

type Rec = {
  model: string;
  timestamp: number;
  explicitTs: boolean;
  messageId?: number;
  toMessageId?: number;
  ledgerIndex?: number;
  /** Position among assistant messages, for id-less messages. */
  msgIndex?: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const sameUsage = (a: Rec, b: Rec): boolean =>
  a.model === b.model &&
  a.input === b.input &&
  a.output === b.output &&
  a.cacheRead === b.cacheRead &&
  a.cacheWrite === b.cacheWrite;

/** Parse one thread into usage records, reconciling ledger and messages. */
export function parseAmpThread(thread: AmpThread, fileMtimeMs: number): Rec[] {
  const created = typeof thread.created === "number" && thread.created !== 0 ? thread.created : 0;

  const ledger: Rec[] = [];
  (thread.usageLedger?.events ?? []).forEach((ev, i) => {
    if (!ev || typeof ev.model !== "string") return;
    const explicit = typeof ev.timestamp === "string" ? toMs(ev.timestamp) : undefined;
    const t = ev.tokens ?? {};
    ledger.push({
      model: ev.model,
      timestamp: explicit || created || fileMtimeMs,
      explicitTs: explicit !== undefined && explicit !== 0,
      toMessageId: typeof ev.toMessageId === "number" && ev.toMessageId > 0 ? ev.toMessageId : undefined,
      ledgerIndex: i,
      input: num(t.input),
      output: num(t.output),
      cacheRead: num(t.cacheReadInputTokens),
      cacheWrite: num(t.cacheCreationInputTokens),
    });
  });

  const base = created || fileMtimeMs;
  const messages: Rec[] = [];
  for (const m of thread.messages ?? []) {
    if (m?.role !== "assistant" || !m.usage || typeof m.usage.model !== "string") continue;
    const id = typeof m.messageId === "number" && m.messageId > 0 ? m.messageId : 0;
    const u = m.usage;
    messages.push({
      model: u.model!,
      timestamp: base + id * 1000,
      explicitTs: false,
      messageId: id > 0 ? id : undefined,
      msgIndex: messages.length,
      input: num(u.inputTokens),
      output: num(u.outputTokens),
      cacheRead: num(u.cacheReadInputTokens),
      cacheWrite: num(u.cacheCreationInputTokens),
    });
  }

  if (ledger.length === 0) return messages.sort((a, b) => a.timestamp - b.timestamp);

  const consumed = ledger.map(() => false);
  let searchStart = 0;
  const unmatched: Rec[] = [];

  const find = (pred: (i: number) => boolean): number => {
    for (let i = searchStart; i < ledger.length; i++) if (pred(i)) return i;
    for (let i = 0; i < searchStart && i < ledger.length; i++) if (pred(i)) return i;
    return -1;
  };

  for (const msg of messages) {
    let idx = -1;
    if (msg.messageId !== undefined) {
      idx = find((i) => !consumed[i] && ledger[i].toMessageId === msg.messageId);
    }
    if (idx < 0) idx = find((i) => !consumed[i] && sameUsage(ledger[i], msg));
    if (idx < 0) {
      unmatched.push(msg);
      continue;
    }
    consumed[idx] = true;
    searchStart = idx + 1;
    const l = ledger[idx];
    // Ledger tokens win; a ledger event without its own timestamp takes the
    // message's (thread-created + messageId seconds), as in tokscale.
    ledger[idx] = {
      ...l,
      messageId: msg.messageId,
      timestamp: l.explicitTs ? l.timestamp : msg.timestamp,
    };
  }

  return [...ledger, ...unmatched].sort((a, b) => a.timestamp - b.timestamp);
}

export class AmpAdapter implements Adapter {
  readonly name = "amp" as const;

  private get root(): string {
    return process.env.BURNLOG_AMP_DIR ?? join(xdgData(), "amp", "threads");
  }

  detect(): boolean {
    return existsSync(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const root = this.root;
    if (!existsSync(root)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const files = walkFiles(root, (n) => n.startsWith("T-") && n.endsWith(".json"));
    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;

    for (const file of files) {
      let mtimeMs: number;
      let thread: AmpThread;
      try {
        mtimeMs = statSync(file).mtimeMs;
        if (!shouldRead(mtimeMs, opts.since)) continue;
        thread = JSON.parse(readFileSync(file, "utf8")) as AmpThread;
      } catch {
        continue;
      }
      scannedFiles++;
      if (!thread || typeof thread !== "object") continue;

      const threadId = typeof thread.id === "string" && thread.id ? thread.id : file;
      for (const r of parseAmpThread(thread, Math.floor(mtimeMs))) {
        if (r.input + r.output + r.cacheRead + r.cacheWrite === 0) continue;
        const key =
          r.messageId !== undefined
            ? hashId("amp", threadId, "m", r.messageId)
            : r.ledgerIndex !== undefined
              ? hashId("amp", threadId, "l", r.ledgerIndex)
              : hashId("amp", threadId, "p", r.msgIndex ?? -1);
        byId.set(key, {
          requestId: key,
          source: this.name,
          model: r.model,
          provider: providerFromModel(r.model),
          inputTokens: r.input,
          outputTokens: r.output,
          cacheCreationTokens: r.cacheWrite,
          cacheReadTokens: r.cacheRead,
          timestamp: new Date(r.timestamp).toISOString(),
        });
      }
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

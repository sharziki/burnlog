import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, toMs, walkFiles } from "./fileutil.js";

/**
 * Codebuff (formerly Manicode) adapter — ported from tokscale's
 * `sessions/codebuff.rs`. Freebuff (freebuff.ts) is the same CLI built in
 * free mode and shares this tree and these helpers.
 *
 * Chat history lives per channel, project and chat:
 *
 *   ~/.config/manicode[-dev|-staging]/projects/<project>/chats/<chatId>/chat-messages.json
 *
 * (`~/.config` on every OS, as in tokscale.) CODEBUFF_DATA_DIR replaces the
 * channel roots with `<dir>/projects`; FREEBUFF_DATA_DIR does the same for
 * Freebuff and otherwise follows CODEBUFF_DATA_DIR. BURNLOG_CODEBUFF_DIR /
 * BURNLOG_FREEBUFF_DIR point straight at a `projects` directory.
 *
 * `chat-messages.json` is a ChatMessage[]. Assistant rows (`variant` or
 * `role` of ai/agent/assistant) carry per-message usage in, by priority:
 * `metadata.usage`, `metadata.codebuff.usage`, then the last assistant entry
 * of `metadata.runState.sessionState.mainAgentState.messageHistory` with
 * `providerOptions.usage` — camelCase or snake_case, each missing bucket
 * filled from the next source. Buckets are taken as-is (tokscale does not
 * subtract cache from input here).
 *
 * requestId: sha of the message's own `id` when it has one; otherwise of
 * (chat path context, timestamp, model, ordinal, tokens) — tokscale's key,
 * hashed because it embeds the project name.
 */

/** `<root>/projects` directories to scan. */
export function manicodeProjectRoots(overrideVar: string, burnlogVar: string, fallbackVar?: string): string[] {
  const burnlog = envDir(burnlogVar);
  if (burnlog) return [burnlog];
  const override = envDir(overrideVar) ?? (fallbackVar ? envDir(fallbackVar) : undefined);
  if (override) return [join(override.trim(), "projects")];
  const config = join(homedir(), ".config");
  return ["manicode", "manicode-dev", "manicode-staging"].map((c) => join(config, c, "projects"));
}

export function chatFiles(roots: string[]): string[] {
  const out = new Set<string>();
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const f of walkFiles(r, (n) => n === "chat-messages.json", 6)) out.add(f);
  }
  return [...out];
}

export type Usage = {
  model?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  credits: number;
};

type J = Record<string, unknown>;
const obj = (v: unknown): J | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, credits: 0 });

export const hasSignal = (u: Usage): boolean =>
  u.input > 0 || u.output > 0 || u.cacheRead > 0 || u.cacheWrite > 0 || u.credits > 0;

function mergeFallback(a: Usage, b: Usage): void {
  if (a.input <= 0) a.input = b.input;
  if (a.output <= 0) a.output = b.output;
  if (a.cacheRead <= 0) a.cacheRead = b.cacheRead;
  if (a.cacheWrite <= 0) a.cacheWrite = b.cacheWrite;
  if (a.model === undefined) a.model = b.model;
  if (a.credits <= 0) a.credits = b.credits;
}

/** First key holding a positive number (tokscale's `pick_number`). */
function pick(v: J, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = v[k];
    if (typeof n === "number" && Number.isFinite(n) && Math.trunc(n) > 0) return Math.trunc(n);
  }
  return undefined;
}

function parseUsageObject(value: unknown): Usage {
  const u = emptyUsage();
  const v = obj(value);
  if (!v) return u;
  u.input = pick(v, ["inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]) ?? 0;
  u.output = pick(v, ["outputTokens", "output_tokens", "completionTokens", "completion_tokens"]) ?? 0;
  let cacheRead = pick(v, ["cacheReadInputTokens", "cache_read_input_tokens", "cachedTokensCreated", "cached_tokens_created"]);
  if (cacheRead === undefined) {
    const d = obj(v.promptTokensDetails) ?? obj(v.prompt_tokens_details);
    const c = d ? (d.cachedTokens ?? d.cached_tokens) : undefined;
    if (typeof c === "number" && Number.isInteger(c)) cacheRead = c;
  }
  u.cacheRead = Math.max(0, cacheRead ?? 0);
  u.cacheWrite =
    pick(v, ["cacheCreationInputTokens", "cache_creation_input_tokens", "cacheCreationTokens", "cache_creation_tokens"]) ?? 0;
  if (typeof v.credits === "number") u.credits = v.credits;
  if (typeof v.model === "string") u.model = v.model;
  return u;
}

function usageFromRunState(meta: J): Usage | undefined {
  const history = obj(obj(obj(meta.runState)?.sessionState)?.mainAgentState)?.messageHistory;
  if (!Array.isArray(history)) return undefined;
  const acc = emptyUsage();
  let found = false;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = obj(history[i]);
    if (!entry || entry.role !== "assistant") continue;
    const po = obj(entry.providerOptions);
    if (!po) continue;
    const eu = emptyUsage();
    if (po.usage !== undefined) mergeFallback(eu, parseUsageObject(po.usage));
    const cb = obj(po.codebuff);
    if (cb?.usage !== undefined) mergeFallback(eu, parseUsageObject(cb.usage));
    if (typeof cb?.model === "string") eu.model = cb.model;
    if (hasSignal(eu) || eu.model !== undefined) found = true;
    mergeFallback(acc, eu);
  }
  return found ? acc : undefined;
}

export function extractAssistantUsage(msg: J): Usage {
  const u = emptyUsage();
  const meta = obj(msg.metadata);
  if (meta) {
    if (typeof meta.model === "string") u.model = meta.model;
    if (meta.usage !== undefined) mergeFallback(u, parseUsageObject(meta.usage));
    const cb = obj(meta.codebuff);
    if (cb?.usage !== undefined) mergeFallback(u, parseUsageObject(cb.usage));
    const rs = usageFromRunState(meta);
    if (rs) mergeFallback(u, rs);
  }
  if (typeof msg.credits === "number" && msg.credits > 0 && u.credits <= 0) u.credits = msg.credits;
  return u;
}

export function isAssistant(msg: J): boolean {
  const v = str(msg.variant) ?? str(msg.role) ?? "";
  return v === "ai" || v === "agent" || v === "assistant";
}

export function messageTimestamp(msg: J): number | undefined {
  for (const k of ["timestamp", "createdAt"]) {
    if (msg[k] !== undefined) {
      const t = toMs(msg[k]);
      if (t !== undefined) return t;
    }
  }
  const meta = obj(msg.metadata);
  return meta && meta.timestamp !== undefined ? toMs(meta.timestamp) : undefined;
}

/** chatId is an ISO time with the time's `:` swapped for `-` (2025-12-14T10-00-00.000Z). */
export function chatIdToMs(chatId: string): number | undefined {
  const t = chatId.indexOf("T");
  if (t < 0) return undefined;
  const rebuilt = chatId.slice(0, t) + chatId.slice(t).replace("-", ":").replace("-", ":");
  return toMs(rebuilt);
}

/** (channel, project, chatId) from `.../<channel>/projects/<project>/chats/<chatId>/chat-messages.json`. */
export function chatContext(file: string): { channel: string; project: string; chatId: string } {
  const chatDir = dirname(file);
  const projectDir = dirname(dirname(chatDir));
  return {
    chatId: basename(chatDir) || "unknown",
    project: basename(projectDir) || "unknown",
    channel: basename(dirname(dirname(projectDir))) || "manicode",
  };
}

export function mapProvider(model: string): BurnEvent["provider"] {
  const prefix = model.includes("/") ? model.split("/")[0].toLowerCase() : "";
  if (prefix === "anthropic" || prefix === "openai" || prefix === "google") return prefix;
  return providerFromModel(model);
}

export function parseCodebuffChat(file: string, messages: unknown[], mtimeMs: number): BurnEvent[] {
  const { channel, project, chatId } = chatContext(file);
  const sessionId = `${channel}/${project}/${chatId}`;
  const chatTs = chatIdToMs(chatId);
  const out: BurnEvent[] = [];

  messages.forEach((m, ordinal) => {
    const msg = obj(m);
    if (!msg || !isAssistant(msg)) return;
    const u = extractAssistantUsage(msg);
    if (!hasSignal(u)) return;
    if (u.input + u.output + u.cacheRead + u.cacheWrite === 0) return; // credits-only: no tokens to report
    const ts = messageTimestamp(msg) ?? chatTs ?? Math.floor(mtimeMs);
    const model = u.model ?? "codebuff-unknown";
    const upstream = str(msg.id);
    const key = upstream
      ? hashId("codebuff", upstream)
      : hashId("codebuff", sessionId, ts, model, ordinal, u.input, u.output, u.cacheRead, u.cacheWrite);
    out.push({
      requestId: key,
      source: "codebuff",
      model,
      provider: mapProvider(model),
      inputTokens: u.input,
      outputTokens: u.output,
      cacheCreationTokens: u.cacheWrite,
      cacheReadTokens: u.cacheRead,
      timestamp: new Date(ts).toISOString(),
    });
  });
  return out;
}

export class CodebuffAdapter implements Adapter {
  readonly name = "codebuff" as const;

  private roots(): string[] {
    return manicodeProjectRoots("CODEBUFF_DATA_DIR", "BURNLOG_CODEBUFF_DIR");
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
      for (const e of parseCodebuffChat(file, messages, mtimeMs)) byId.set(e.requestId, e);
    }
    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines: scannedFiles };
  }
}

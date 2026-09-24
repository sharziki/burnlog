import { basename } from "path";
import type { AdapterName, BurnEvent } from "./types.js";
import {
  type Buckets,
  makeEvent,
  mapProvider,
  mtimeMs,
  obj,
  parseJson,
  parseTimestampStr,
  readLines,
} from "./jsonl-kit.js";

/**
 * Shared parsers for Tencent's CodeBuddy / WorkBuddy formats. Port of
 * tokscale's `sessions/tencent_buddy.rs`.
 *
 * Two sources:
 *
 * 1. Detailed JSONL transcripts: `type:"message"` + `role:"assistant"` (or
 *    `type:"function_call"`) lines, `status` absent or "completed". Usage is
 *    `message.usage`, else `providerData.usage`, else `providerData.rawUsage`.
 *    Model: providerData.model → providerData.requestModelId → message.model.
 *    Key: `<session>:<providerData.messageId | traceId | id>`; a repeated key
 *    keeps the larger total.
 *
 * 2. IDE / VS Code extension logs: `[CraftInvokableAgent] [<agent>] Model
 *    prepared: … (<model>)` names the model, and `[AgentReporter] [<agent>]
 *    Agent execution successful with usage: {…}` carries the usage JSON. The
 *    same line is mirrored to several log sinks a few ms apart, so the key is
 *    agent + SECOND + tokens.
 *
 * Usage buckets arrive under many aliases. `cachedMissTokens` /
 * `cacheMissTokens` are cache-exclusive input; the other input fields are
 * treated as inclusive only when a reported total proves it. Reasoning is a
 * separate bucket in tokscale; burnlog folds it into output.
 */

type Usage = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : undefined;
}

function firstPresent(u: Usage, keys: string[]): number {
  for (const k of keys) {
    const v = num(u[k]);
    if (v !== undefined) return Math.max(0, v);
  }
  return 0;
}

function firstPositive(u: Usage, keys: string[]): number {
  const vals = keys.map((k) => num(u[k])).filter((v): v is number => v !== undefined);
  const pos = vals.find((v) => v > 0);
  return Math.max(0, pos ?? vals[0] ?? 0);
}

/** Buckets in burnlog's convention (reasoning folded into output), or null when empty. */
export function buddyBuckets(u: Usage): { buckets: Buckets; reasoning: number } | null {
  const cacheRead = firstPositive(u, [
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "cacheTokens",
    "prompt_cache_hit_tokens",
    "cached_tokens",
  ]);
  const output = firstPresent(u, ["output_tokens", "outputTokens", "completion_tokens"]);
  const cacheWrite = firstPositive(u, [
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
    "cachedWriteTokens",
    "prompt_cache_write_tokens",
  ]);
  const reasoning = firstPresent(u, ["completion_thinking_tokens", "completionThinkingTokens", "reasoningTokens"]);

  let input: number;
  const miss = num(u.cachedMissTokens) ?? num(u.cacheMissTokens);
  if (miss !== undefined) {
    input = Math.max(0, miss);
  } else {
    input = firstPresent(u, ["input_tokens", "inputTokens", "prompt_tokens"]);
    const total = num(u.total_tokens) ?? num(u.totalTokens);
    if (total !== undefined) {
      const inclusive = input + output;
      const exclusive = inclusive + cacheRead + cacheWrite + reasoning;
      if (cacheRead > 0 && Math.max(0, total) === inclusive && inclusive !== exclusive) {
        input = input - cacheRead; // saturating in tokscale; may go negative there only via overflow
        input = Math.max(0, input);
      }
    }
  }
  if (input + output + cacheRead + cacheWrite + reasoning <= 0) return null;
  return { buckets: { input, output: output + reasoning, cacheRead, cacheWrite }, reasoning };
}

function sumOf(e: BurnEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

/** Parse one detailed JSONL transcript. Keyed events; a repeat keeps the larger total. */
export function parseBuddyJsonl(client: AdapterName, defaultModel: string, file: string): { events: BurnEvent[]; lines: number } {
  const fallbackSession = basename(file).replace(/\.[^.]*$/, "");
  const fallbackMs = mtimeMs(file);
  const keyed = new Map<string, BurnEvent>();
  const unkeyed: BurnEvent[] = [];
  const lines = readLines(file);
  let index = 0;
  for (const line of lines) {
    const rec = parseJson(line);
    if (!rec) continue;
    const isAssistant = rec.type === "message" && rec.role === "assistant";
    if (!isAssistant && rec.type !== "function_call") continue;
    if (typeof rec.status === "string" && rec.status !== "completed") continue;

    const message = obj(rec.message);
    const provider = obj(rec.providerData);
    const usage = obj(message?.usage) ?? obj(provider?.usage) ?? obj(provider?.rawUsage);
    const parsed = usage ? buddyBuckets(usage) : null;
    if (!parsed) continue;

    const pick = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
    const model = pick(provider?.model) ?? pick(provider?.requestModelId) ?? pick(message?.model) ?? defaultModel;
    const session = typeof rec.sessionId === "string" ? rec.sessionId : fallbackSession;
    const ts = typeof rec.timestamp === "number" && Number.isInteger(rec.timestamp) ? rec.timestamp : fallbackMs;
    const id =
      (typeof provider?.messageId === "string" ? provider.messageId : undefined) ??
      (typeof provider?.traceId === "string" ? provider.traceId : undefined) ??
      (typeof rec.id === "string" ? rec.id : undefined);
    const key = id !== undefined ? `${client}:${session}:${id}` : `${client}:${session}:line:${index}`;
    index++;
    const e = makeEvent(client, key, model, mapProvider(undefined, model), parsed.buckets, ts);
    if (!e) continue;
    if (id === undefined) {
      unkeyed.push(e);
      continue;
    }
    const prev = keyed.get(key);
    if (!prev || sumOf(e) >= sumOf(prev)) keyed.set(key, e);
  }
  return { events: [...keyed.values(), ...unkeyed], lines: lines.length };
}

function bracketAfter(line: string, marker: string): string | undefined {
  const at = line.indexOf(marker);
  if (at < 0) return undefined;
  const after = line.slice(at + marker.length);
  const open = after.indexOf("[");
  if (open < 0) return undefined;
  const rest = after.slice(open + 1);
  const close = rest.indexOf("]");
  if (close < 0) return undefined;
  const v = rest.slice(0, close).trim();
  return v || undefined;
}

/** Log line timestamp: `[YYYY-MM-DD HH:MM:SS.mmm]` or `YYYY/MM/DD HH:MM:SS [..`, in LOCAL time. */
function logTimestampMs(line: string): number | undefined {
  let raw: string;
  if (line.startsWith("[")) {
    const end = line.indexOf("]");
    if (end < 0) return undefined;
    raw = line.slice(1, end).trim();
  } else {
    const at = line.indexOf(" [");
    raw = (at >= 0 ? line.slice(0, at) : line).trim();
  }
  const space = raw.indexOf(" ");
  if (space < 0) return undefined;
  const date = raw.slice(0, space);
  const time = raw.slice(space + 1);
  const parts = date.split(date.includes("/") ? "/" : "-").map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p))) return parseTimestampStr(raw);
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(time);
  if (!m) return parseTimestampStr(raw);
  const ms = m[4] ? Math.floor(Number(`0.${m[4]}`) * 1000) : 0;
  const d = new Date(parts[0], parts[1] - 1, parts[2], Number(m[1]), Number(m[2]), Number(m[3]), ms);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

/** Parse one IDE/extension log. */
export function parseBuddyExtensionLog(
  client: AdapterName,
  defaultModel: string,
  file: string,
): { events: BurnEvent[]; lines: number } {
  const fallbackMs = mtimeMs(file);
  const modelByAgent = new Map<string, string>();
  const events: BurnEvent[] = [];
  const lines = readLines(file);
  const USAGE = "Agent execution successful with usage:";
  for (const [lineIndex, line] of lines.entries()) {
    if (line.includes("[CraftInvokableAgent]") && line.includes("Model prepared:")) {
      const agent = bracketAfter(line, "[CraftInvokableAgent]");
      const after = line.split("Model prepared:")[1]?.trim() ?? "";
      const open = after.lastIndexOf("(");
      let model = after;
      if (open >= 0) {
        const close = after.indexOf(")", open);
        const inner = close > open ? after.slice(open + 1, close).trim() : "";
        if (inner) model = inner;
      }
      if (agent) modelByAgent.set(agent, model);
      continue;
    }
    if (!line.includes("[AgentReporter]") || !line.includes(USAGE)) continue;
    const agent = bracketAfter(line, "[AgentReporter]");
    if (!agent) continue;
    const jsonPart = line.split(USAGE)[1]?.trim() ?? "";
    const end = jsonPart.lastIndexOf("}");
    if (end < 0) continue;
    const usage = parseJson(jsonPart.slice(0, end + 1));
    const parsed = usage ? buddyBuckets(usage) : null;
    if (!parsed) continue;
    const logged = logTimestampMs(line);
    const ts = logged ?? fallbackMs;
    const model = modelByAgent.get(agent) ?? defaultModel;
    const b = parsed.buckets;
    const key = [
      `${client}:extension-log:${agent}`,
      // The mtime fallback moves between syncs; the line position does not.
      logged !== undefined ? Math.floor(logged / 1000) : `line${lineIndex}`,
      b.input,
      b.output - parsed.reasoning,
      b.cacheRead,
      b.cacheWrite,
      parsed.reasoning,
    ].join(":");
    const e = makeEvent(client, key, model, mapProvider(undefined, model), b, ts);
    if (e) events.push(e);
  }
  return { events, lines: lines.length };
}

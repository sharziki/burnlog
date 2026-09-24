import { homedir } from "os";
import { join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import {
  type Buckets,
  EventSet,
  collectFiles,
  envPath,
  isDir,
  isFile,
  makeEvent,
  mapProvider,
  mtimeMs,
  obj,
  parseJson,
  readLines,
} from "./jsonl-kit.js";

/**
 * GitHub Copilot CLI (and VS Code Copilot Chat) OpenTelemetry file export.
 * Port of tokscale's `sessions/copilot.rs`.
 *
 * Copilot writes OTEL spans and log records as JSONL when file export is on:
 * `~/.copilot/otel/*.jsonl` (every OS), plus the single file named by
 * `$COPILOT_OTEL_FILE_EXPORTER_PATH`.
 *
 * Usage comes from GenAI semantic-convention attributes
 * (`gen_ai.usage.input_tokens`, `…output_tokens`, `…cache_read.input_tokens`,
 * `…cache_write.input_tokens`, `…reasoning.output_tokens`, and older
 * spellings). `input_tokens` INCLUDES cache reads, so fresh input is
 * input − cache_read. tokscale keeps reasoning as its own bucket; burnlog
 * folds it into output.
 *
 * The same call is reported at several levels, so sources rank:
 * chat spans > inference log records > agent-turn log records > invoke_agent
 * summary spans. A lower source is used only when no higher one covers the
 * same trace or response id. Records sharing a key (trace:span, or the
 * source-specific fallback) merge field-wise by max, with fresh input
 * recomputed from the largest inclusive input.
 *
 * The desktop app, session-store and VS Code chat-session sources are
 * separate adapters (copilot-desktop / copilot-session-store /
 * copilot-vscode).
 *
 * Override the `~/.copilot` directory with BURNLOG_COPILOT_DIR (its `otel/`
 * subdirectory is scanned).
 */

type Source = "chat" | "inference" | "agent-turn" | "agent-summary";
type Rec = Record<string, unknown>;

type Candidate = {
  source: Source;
  traceId?: string;
  responseId?: string;
  model?: string;
  sessionId?: string;
  key: string;
  timestampMs: number;
  startMs?: number;
  inclusiveInput: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
};

const MODEL_ATTRS = ["gen_ai.response.model", "gen_ai.request.model"];
const SESSION_ATTRS: Array<[string, number]> = [
  ["gen_ai.conversation.id", 3],
  ["copilot_chat.session_id", 3],
  ["copilot_chat.chat_session_id", 3],
  ["session.id", 3],
  ["github.copilot.interaction_id", 2],
  ["gen_ai.response.id", 1],
];

function valueAsInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

function attrInt(a: Rec, keys: string[]): number {
  for (const k of keys) {
    const v = Math.max(0, valueAsInt(a[k]) ?? 0);
    if (v > 0) return v;
  }
  return 0;
}

function firstAttr(a: Rec, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function bestSession(a: Rec): [string, number] | undefined {
  let best: [string, number] | undefined;
  for (const [k, p] of SESSION_ATTRS) {
    const v = a[k];
    if (typeof v !== "string" || !v.trim()) continue;
    if (!best || p > best[1]) best = [v, p];
  }
  return best;
}

const validId = (id: unknown): id is string => typeof id === "string" && id !== "" && !/^0+$/.test(id);

function idOf(r: Rec, key: "traceId" | "spanId"): string | undefined {
  if (validId(r[key])) return r[key] as string;
  const ctx = obj(r.spanContext);
  return ctx && validId(ctx[key]) ? (ctx[key] as string) : undefined;
}

function isSpan(r: Rec): boolean {
  if (typeof r.type === "string") return r.type === "span";
  const hasName = typeof r.name === "string";
  const identity = typeof r.spanId === "string" || typeof r.traceId === "string";
  const timing = r.startTime !== undefined || r.endTime !== undefined || r.duration !== undefined;
  return hasName && (identity || timing || r.kind !== undefined);
}

function body(r: Rec): string | undefined {
  return typeof r.body === "string" ? r.body : typeof r._body === "string" ? r._body : undefined;
}

function classify(r: Rec, a: Rec): Source | undefined {
  const op = a["gen_ai.operation.name"];
  const name = typeof r.name === "string" ? r.name : "";
  if (isSpan(r)) {
    if (op === "chat" || name.startsWith("chat ")) return "chat";
    if (op === "invoke_agent" || name.startsWith("invoke_agent ")) return "agent-summary";
    return undefined;
  }
  const b = body(r);
  if (a["event.name"] === "gen_ai.client.inference.operation.details" || b?.startsWith("GenAI inference:"))
    return "inference";
  if (a["event.name"] === "copilot_chat.agent.turn" || b?.startsWith("copilot_chat.agent.turn")) return "agent-turn";
  return undefined;
}

/** OTEL HrTime `[seconds, nanos]` → ms. */
function hrMs(v: unknown): number | undefined {
  if (!Array.isArray(v)) return undefined;
  const s = valueAsInt(v[0]);
  const ns = valueAsInt(v[1]);
  if (s === undefined || ns === undefined) return undefined;
  return s * 1000 + Math.trunc(ns / 1e6);
}

function scalarMs(v: unknown): number | undefined {
  const raw = valueAsInt(v);
  if (raw === undefined) return undefined;
  const abs = Math.abs(raw);
  if (abs >= 1e17) return Math.trunc(raw / 1e6);
  if (abs >= 1e14) return Math.trunc(raw / 1e3);
  if (abs >= 1e11) return raw;
  return raw * 1000;
}

function durationMs(r: Rec): number | undefined {
  const s = hrMs(r.startTime);
  const e = hrMs(r.endTime);
  if (s !== undefined && e !== undefined && e - s > 0) return e - s;
  const d = r.duration;
  if (Array.isArray(d)) {
    const sec = valueAsInt(d[0]);
    if (sec === undefined) return undefined;
    const ms = sec * 1000 + Math.trunc((valueAsInt(d[1]) ?? 0) / 1e6);
    return ms > 0 ? ms : undefined;
  }
  const f = typeof d === "number" ? d : typeof d === "string" ? Number.parseFloat(d) : NaN;
  if (!Number.isFinite(f) || f <= 0) return undefined;
  const ms = f >= 1e6 ? Math.trunc(f / 1e6) : Math.trunc(f);
  return ms > 0 ? ms : undefined;
}

function recordMs(r: Rec): number | undefined {
  const start = hrMs(r.startTime);
  if (start !== undefined) return start;
  const end = hrMs(r.endTime);
  if (end !== undefined) return end - (durationMs(r) ?? 0);
  const nanos = valueAsInt(r.timeUnixNano);
  return (
    hrMs(r.hrTime) ??
    hrMs(r._hrTime) ??
    hrMs(r.time) ??
    scalarMs(r.timestamp) ??
    scalarMs(r.observedTimestamp) ??
    (nanos !== undefined && nanos > 0 ? Math.trunc(nanos / 1e6) : undefined)
  );
}

function freshInput(inclusive: number, cacheRead: number): number {
  return Math.max(0, inclusive - Math.min(cacheRead, inclusive));
}

export function parseCopilotOtel(lines: string[], fallbackMs: number): Candidate[] {
  // Pass 1: per-trace model/session context, and usage candidates.
  const contexts = new Map<string, { model?: string; session?: string; priority: number }>();
  const pending: Array<Omit<Candidate, "key"> & { spanId?: string; turnIndex?: number; index: number }> = [];
  let index = 0;
  for (const line of lines) {
    const r = parseJson(line);
    if (!r) continue;
    const a = obj(r.attributes);
    const traceId = idOf(r, "traceId");
    if (traceId && a) {
      const ctx = contexts.get(traceId) ?? { priority: 0 };
      ctx.model ??= firstAttr(a, MODEL_ATTRS);
      const s = bestSession(a);
      if (s && s[1] > ctx.priority) {
        ctx.session = s[0];
        ctx.priority = s[1];
      }
      contexts.set(traceId, ctx);
    }
    const myIndex = index++;
    if (!a) continue;
    const source = classify(r, a);
    if (!source) continue;

    const inclusiveInput = attrInt(a, ["gen_ai.usage.input_tokens"]);
    const output = attrInt(a, ["gen_ai.usage.output_tokens"]);
    const cacheRead = attrInt(a, ["gen_ai.usage.cache_read.input_tokens", "gen_ai.usage.cache_read_input_tokens"]);
    const cacheWrite = attrInt(a, [
      "gen_ai.usage.cache_write.input_tokens",
      "gen_ai.usage.cache_creation.input_tokens",
      "gen_ai.usage.cache_write_input_tokens",
      "gen_ai.usage.cache_creation_input_tokens",
    ]);
    const reasoning = attrInt(a, ["gen_ai.usage.reasoning.output_tokens", "gen_ai.usage.reasoning_tokens"]);
    if (freshInput(inclusiveInput, cacheRead) + output + cacheRead + cacheWrite + reasoning === 0) continue;

    const recMs = recordMs(r);
    const dur = durationMs(r);
    const explicitStart = hrMs(r.startTime);
    const explicitEnd = hrMs(r.endTime);
    const startMs = explicitStart ?? (recMs !== undefined && (dur !== undefined || explicitEnd === undefined) ? recMs : undefined);
    const turnIndex = ["turn.index", "copilot_chat.turn.index"].map((k) => valueAsInt(a[k])).find((v) => v !== undefined);
    pending.push({
      source,
      traceId,
      spanId: idOf(r, "spanId"),
      responseId: firstAttr(a, ["gen_ai.response.id"]),
      model: firstAttr(a, MODEL_ATTRS),
      sessionId: bestSession(a)?.[0],
      turnIndex,
      timestampMs: recMs ?? fallbackMs,
      startMs,
      inclusiveInput,
      output,
      cacheRead,
      cacheWrite,
      reasoning,
      index: myIndex,
    });
  }

  // Resolve model/session from the trace and build the per-source key.
  const candidates: Candidate[] = pending.map((p) => {
    const ctx = p.traceId ? contexts.get(p.traceId) : undefined;
    const session = p.sessionId ?? ctx?.session ?? p.traceId ?? "unknown-session";
    let key: string;
    if (p.source === "chat" || p.source === "agent-summary") {
      key =
        p.traceId && p.spanId
          ? `${p.traceId}:${p.spanId}`
          : p.spanId
            ? `span:${session}:${p.spanId}`
            : `span:${session}:${p.timestampMs}:${p.index}`;
    } else if (p.source === "inference") {
      key = p.traceId && p.spanId ? `log:${p.traceId}:${p.spanId}` : `log:${session}:${p.timestampMs}:${p.index}`;
    } else {
      const turn = p.turnIndex !== undefined ? String(p.turnIndex) : `idx-${p.index}`;
      key = p.traceId ? `agent-turn:${p.traceId}:${turn}` : `agent-turn:${session}:${turn}:${p.index}`;
    }
    return { ...p, model: p.model ?? ctx?.model, sessionId: session, key };
  });

  // Keep the highest-ranked source for each trace / response.
  const traces = (s: Source) => new Set(candidates.filter((c) => c.source === s && c.traceId).map((c) => c.traceId!));
  const responses = (s: Source) =>
    new Set(candidates.filter((c) => c.source === s && c.responseId).map((c) => c.responseId!));
  const higher: Record<Source, Source[]> = {
    chat: [],
    inference: ["chat"],
    "agent-turn": ["chat", "inference"],
    "agent-summary": ["chat", "inference", "agent-turn"],
  };
  const traceSets = { chat: traces("chat"), inference: traces("inference"), "agent-turn": traces("agent-turn") };
  const respSets = { chat: responses("chat"), inference: responses("inference"), "agent-turn": responses("agent-turn") };
  const kept = candidates.filter((c) =>
    higher[c.source].every(
      (h) =>
        !(c.traceId && traceSets[h as keyof typeof traceSets].has(c.traceId)) &&
        !(c.responseId && respSets[h as keyof typeof respSets].has(c.responseId)),
    ),
  );

  // Merge duplicates by key, field-wise max.
  const merged = new Map<string, Candidate>();
  for (const c of kept) {
    const m = merged.get(c.key);
    if (!m) {
      merged.set(c.key, { ...c });
      continue;
    }
    m.inclusiveInput = Math.max(m.inclusiveInput, c.inclusiveInput);
    m.output = Math.max(m.output, c.output);
    m.cacheRead = Math.max(m.cacheRead, c.cacheRead);
    m.cacheWrite = Math.max(m.cacheWrite, c.cacheWrite);
    m.reasoning = Math.max(m.reasoning, c.reasoning);
    const fallbackTs = Math.min(m.timestampMs, c.timestampMs);
    m.startMs = m.startMs !== undefined && c.startMs !== undefined ? Math.min(m.startMs, c.startMs) : (m.startMs ?? c.startMs);
    m.timestampMs = m.startMs ?? fallbackTs;
  }
  return [...merged.values()];
}

export function candidateBuckets(c: Candidate): Buckets {
  return {
    input: freshInput(c.inclusiveInput, c.cacheRead),
    output: c.output + c.reasoning,
    cacheRead: c.cacheRead,
    cacheWrite: c.cacheWrite,
  };
}

/**
 * Sessions the OTEL export already covers. The Copilot CLI can record the same
 * run in its OTEL file *and* in data.db / session-store.db; tokscale counts the
 * OTEL copy and drops the database copy by session id, and so do we — the
 * database adapters call this and skip those sessions.
 */
export function copilotOtelSessionIds(): Set<string> {
  const adapter = new CopilotAdapter();
  const ids = new Set<string>();
  for (const file of adapter.otelFiles()) {
    for (const c of parseCopilotOtel(readLines(file), mtimeMs(file))) if (c.sessionId) ids.add(c.sessionId);
  }
  return ids;
}

export class CopilotAdapter implements Adapter {
  readonly name = "copilot" as const;

  private get otelDir(): string {
    return join(envPath("BURNLOG_COPILOT_DIR") ?? join(homedir(), ".copilot"), "otel");
  }

  private get exporterFile(): string | undefined {
    if (envPath("BURNLOG_COPILOT_DIR")) return undefined;
    const p = process.env.COPILOT_OTEL_FILE_EXPORTER_PATH?.trim();
    return p ? p : undefined;
  }

  detect(): boolean {
    const f = this.exporterFile;
    return isDir(this.otelDir) || (f !== undefined && isFile(f));
  }

  /** Every OTEL file to read; `since` narrows it the way scan does. */
  otelFiles(opts: ScanOptions = {}): string[] {
    const { files } = collectFiles([this.otelDir], (n) => n.endsWith(".jsonl"), opts);
    const extra = this.exporterFile;
    if (extra && isFile(extra) && !files.includes(extra) && shouldRead(mtimeMs(extra), opts.since)) files.push(extra);
    return files;
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { anyRoot } = collectFiles([this.otelDir], (n) => n.endsWith(".jsonl"), opts);
    const files = this.otelFiles(opts);
    const extra = this.exporterFile;
    if (!anyRoot && !(extra && isFile(extra))) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed (OTEL file export off)" };
    }

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const lines = readLines(file);
      totalLines += lines.length;
      for (const c of parseCopilotOtel(lines, mtimeMs(file))) {
        const model = c.model ?? "unknown";
        events.add(makeEvent(this.name, c.key, model, mapProvider(undefined, model), candidateBuckets(c), c.timestampMs));
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

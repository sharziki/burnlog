import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, envOrHome, hashId, toMs, walkFiles } from "./fileutil.js";

/**
 * Grok Build adapter (ported from tokscale's `sessions/grok.rs`).
 *
 * Grok Build's home is `$GROK_HOME`, default `~/.grok` on every platform.
 * Two sources carry usage:
 *
 * 1. Legacy per-session JSON-RPC logs:
 *      <home>/sessions/<urlencoded-workspace>/<session-id>/updates.jsonl
 *    with siblings `summary.json`, `events.jsonl`, `signals.json` (read for
 *    the model id and the compaction-proof session total only).
 *    - `params.update.usage` records give a per-turn breakdown: inputTokens
 *      INCLUDES cachedReadTokens and outputTokens INCLUDES reasoningTokens
 *      (when totalTokens is absent or equals input+output).
 *    - Older logs only carry a cumulative `totalTokens` counter; positive
 *      per-turn deltas (turns split on `user_message_chunk`) are recorded as
 *      input, and `signals.json` reconciles anything compaction hid.
 *    - Once usage records exist, counter deltas are kept only when newer than
 *      the latest usage record (an in-flight turn).
 *
 * 2. The newer append-only log `<home>/logs/unified.jsonl`: each
 *    `shell.turn.inference_done` row has `ctx.prompt_tokens` (includes
 *    `cached_prompt_tokens`) and `ctx.completion_tokens` (includes
 *    `reasoning_tokens`). Model attribution follows tokscale: explicit
 *    per-(pid, session) model changes, subagent spawn/terminal evidence (with
 *    PID-reuse generations bumped on `AuthManager::new`), then per-session and
 *    per-process fallbacks.
 *
 * Sessions covered by the unified log prefer it; a legacy row is dropped only
 * when a unified row matches its (session, timestamp, total) — or, for
 * counter-delta rows, its (session, timestamp) — so partially migrated
 * history is never lost.
 *
 * Output here = completion incl. reasoning; input = prompt minus cached.
 * Override the Grok home with BURNLOG_GROK_DIR.
 */

type Json = Record<string, unknown>;

const UNKNOWN_MODEL = "grok-unknown";

type Row = {
  key: string;
  sessionId: string;
  model: string;
  ts: number;
  input: number;
  output: number; // excludes reasoning
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  kind: "unified" | "usage" | "fallback" | "signals";
  conflicted?: boolean;
};

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function get(v: unknown, path: string[]): unknown {
  let cur: unknown = v;
  for (const k of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** tokscale's `extract_i64`: integers or integer strings. */
function int(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function nonNeg(v: unknown): number | undefined {
  const n = int(v);
  return n !== undefined && n >= 0 ? n : undefined;
}

/** Present-and-valid, or absent (→ 0); a present-but-invalid value is undefined. */
function optNonNeg(v: unknown): number | undefined {
  return v === undefined ? 0 : nonNeg(v);
}

function tsOf(v: unknown): number | undefined {
  if (typeof v === "number" && v <= 0) return undefined;
  return toMs(v);
}

function total(r: Row): number {
  return r.input + r.output + r.reasoning + r.cacheRead + r.cacheWrite;
}

function mtimeMs(p: string): number {
  try {
    return Math.round(statSync(p).mtimeMs);
  } catch {
    return 0;
  }
}

function readJson(p: string): unknown {
  try {
    return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return undefined;
  }
}

function lines(p: string): string[] {
  try {
    return readFileSync(p, "utf8").replace(/^\uFEFF/, "").split("\n");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Legacy per-session metadata (model id + timestamp only).

type Meta = { sessionId: string; model?: string; ts: number };

function signalsModel(v: Json): string | undefined {
  const primary = str(v.primaryModelId);
  if (primary) return primary;
  return Array.isArray(v.modelsUsed) ? str(v.modelsUsed[0]) : undefined;
}

function readSessionMeta(sessionDir: string, sessionId: string, fallbackTs: number): Meta {
  const meta: Meta = { sessionId, ts: fallbackTs };

  const summary = readJson(join(sessionDir, "summary.json"));
  if (isObj(summary)) {
    meta.model ??= str(summary.current_model_id) ?? str(summary.model_id);
    const t = tsOf(summary.updated_at ?? summary.created_at);
    if (t !== undefined) meta.ts = t;
  }

  const events = lines(join(sessionDir, "events.jsonl"));
  for (const line of events.slice(0, 500)) {
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(v)) continue;
    meta.model ??= str(v.model_id);
    if (meta.sessionId === "unknown" && str(v.session_id)) meta.sessionId = str(v.session_id)!;
    const t = tsOf(v.ts);
    if (t !== undefined) meta.ts = t;
    if (meta.model && meta.sessionId !== "unknown") break;
  }

  const signals = readJson(join(sessionDir, "signals.json"));
  if (isObj(signals)) meta.model ??= signalsModel(signals);
  return meta;
}

function modelFromLine(v: Json): string | undefined {
  for (const path of [
    ["params", "update", "_meta", "modelId"],
    ["params", "_meta", "modelId"],
    ["params", "modelId"],
    ["model_id"],
    ["modelId"],
    ["model"],
  ]) {
    const m = str(get(v, path));
    if (m && m.trim()) return m;
  }
  return undefined;
}

function totalFromLine(v: Json): number | undefined {
  for (const path of [
    ["params", "_meta", "totalTokens"],
    ["params", "update", "_meta", "totalTokens"],
    ["params", "update", "totalTokens"],
    ["params", "totalTokens"],
    ["usage", "totalTokens"],
    ["totalTokens"],
  ]) {
    const n = int(get(v, path));
    if (n !== undefined) return n;
  }
  return undefined;
}

function tsFromLine(v: Json): number | undefined {
  for (const path of [
    ["params", "_meta", "agentTimestampMs"],
    ["params", "update", "_meta", "agentTimestampMs"],
    ["params", "timestamp"],
    ["timestamp"],
    ["ts"],
  ]) {
    const t = tsOf(get(v, path));
    if (t !== undefined) return t;
  }
  return undefined;
}

function pick(obj: Json, keys: string[]): number {
  for (const k of keys) {
    const n = int(obj[k]);
    if (n !== undefined) return Math.max(0, n);
  }
  return 0;
}

function usageFromLine(v: Json): Pick<Row, "input" | "output" | "reasoning" | "cacheRead" | "cacheWrite"> | null {
  const u = get(v, ["params", "update", "usage"]);
  if (!isObj(u)) return null;
  const rawIn = pick(u, ["inputTokens", "input_tokens", "promptTokens"]);
  const rawOut = pick(u, ["outputTokens", "output_tokens", "completionTokens"]);
  const cacheRead = pick(u, ["cachedReadTokens", "cacheReadTokens", "cache_read_input_tokens"]);
  const cacheWrite = pick(u, ["cachedWriteTokens", "cacheWriteTokens", "cacheCreationTokens", "cache_creation_input_tokens"]);
  const reasoning = pick(u, ["reasoningTokens", "thoughtTokens", "thinkingTokens"]);
  const reportedRaw = int(u.totalTokens ?? u.total_tokens);
  if (rawIn + rawOut + cacheRead + cacheWrite + reasoning === 0) return null;
  const reported = reportedRaw === undefined ? undefined : Math.max(0, reportedRaw);
  const inclusive = reported === undefined || reported === rawIn + rawOut;
  return {
    input: inclusive ? Math.max(0, rawIn - cacheRead) : rawIn,
    output: inclusive ? Math.max(0, rawOut - reasoning) : rawOut,
    reasoning,
    cacheRead,
    cacheWrite,
  };
}

export function parseGrokUpdates(path: string): Row[] {
  const sessionDir = dirname(path);
  const sessionName = basename(sessionDir);
  const meta = readSessionMeta(sessionDir, sessionName.trim() ? sessionName : "unknown", mtimeMs(path));
  const sid = meta.sessionId;

  const fallback: Row[] = [];
  const usage: Row[] = [];
  let currentModel = meta.model ?? UNKNOWN_MODEL;
  let lastTotal: number | undefined;
  let lastTotalTs = meta.ts;
  type Turn = { base: number; max: number; ts: number; model: string; index: number };
  let active: Turn | null = null;
  let turnIndex = 0;
  let usageIndex = 0;

  const closeTurn = (t: Turn): void => {
    const delta = t.max - t.base;
    if (delta <= 0) return;
    fallback.push({
      key: `grok:${sid}:${t.index}`,
      sessionId: sid,
      model: t.model.trim() ? t.model : UNKNOWN_MODEL,
      ts: t.ts,
      input: delta,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      kind: "fallback",
    });
  };
  const observe = (t: Turn, tot: number, ts: number): void => {
    if (tot > t.max) {
      t.max = tot;
      t.ts = ts;
    }
  };

  for (const raw of lines(path)) {
    if (!raw.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isObj(parsed)) continue;
    const v = parsed;

    const m = modelFromLine(v);
    if (m) {
      currentModel = m;
      if (active && active.model === UNKNOWN_MODEL) active.model = currentModel;
    }

    const ts = tsFromLine(v) ?? meta.ts;
    if (get(v, ["params", "update", "sessionUpdate"]) === "user_message_chunk") {
      if (active) closeTurn(active);
      active = { base: lastTotal ?? 0, max: lastTotal ?? 0, ts, model: currentModel, index: turnIndex++ };
    }

    const u = usageFromLine(v);
    if (u) {
      let model = currentModel;
      if (model === UNKNOWN_MODEL) {
        const mu = get(v, ["params", "update", "usage", "modelUsage"]);
        const keys = isObj(mu) ? Object.keys(mu) : [];
        model = (keys.length === 1 ? keys[0] : undefined) ?? meta.model ?? UNKNOWN_MODEL;
      }
      const eventId = str(get(v, ["params", "_meta", "eventId"])) ?? `turn-${usageIndex}`;
      usage.push({
        key: `grok:${sid}:usage:${usageIndex}:${eventId}`,
        sessionId: sid,
        model: model.trim() ? model : UNKNOWN_MODEL,
        ts,
        ...u,
        kind: "usage",
      });
      usageIndex++;
    }

    const tot = totalFromLine(v);
    if (tot === undefined || tot < 0) continue;
    if (lastTotal !== undefined && tot < lastTotal) continue; // counters are monotonic
    if (lastTotal !== undefined && tot === lastTotal) {
      lastTotalTs = ts;
      continue;
    }
    if (lastTotal !== undefined && !active) {
      active = { base: lastTotal, max: lastTotal, ts, model: currentModel, index: turnIndex++ };
    }
    if (active) observe(active, tot, ts);
    lastTotalTs = ts;
    lastTotal = tot;
  }
  if (active) closeTurn(active);

  if (fallback.length === 0 && usage.length === 0 && lastTotal !== undefined && lastTotal > 0) {
    closeTurn({ base: 0, max: lastTotal, ts: lastTotalTs, model: currentModel, index: 0 });
  }

  if (usage.length === 0) {
    // signals.json reconciliation: credit whatever compaction hid.
    const signals = readJson(join(sessionDir, "signals.json"));
    if (isObj(signals)) {
      const before = Math.max(0, int(signals.totalTokensBeforeCompaction) ?? 0);
      const tot = Math.max(0, int(signals.totalTokens) ?? 0);
      const sigTotal =
        signals.contextTokensUsed === undefined
          ? before + tot
          : Math.max(tot, before + Math.max(0, int(signals.contextTokensUsed) ?? 0));
      const covered = fallback.reduce((s, r) => s + r.input, 0);
      const extra = sigTotal - covered;
      if (sigTotal > 0 && extra > 0) {
        const sm = signalsModel(signals);
        fallback.push({
          key: `grok:${sid}:signals`,
          sessionId: sid,
          model: (sm && sm.trim() ? sm : undefined) ?? meta.model ?? currentModel,
          // Anchored to the last update activity, not signals.json's mtime.
          ts: fallback.length ? Math.max(...fallback.map((r) => r.ts)) : meta.ts,
          input: extra,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          kind: "signals",
        });
      }
    }
    return fallback;
  }

  const latestUsage = Math.max(...usage.map((r) => r.ts));
  return [...usage, ...fallback.filter((r) => r.ts > latestUsage)];
}

// ---------------------------------------------------------------------------
// unified.jsonl

type Scope = string; // `${pid}|${gen}|${sessionId}`
type Evidence = string | null; // null = conflict

function authoritative(v: unknown): string | undefined {
  const s = str(v)?.trim();
  return s && s !== UNKNOWN_MODEL ? s : undefined;
}

function record(map: Map<Scope, Evidence>, scope: Scope, model: string): void {
  if (!map.has(scope)) map.set(scope, model);
  else if (map.get(scope) !== model) map.set(scope, null);
}

function subagentId(v: Json): string | undefined {
  const id = str(get(v, ["ctx", "subagent_id"]));
  return id && id.trim() ? id : undefined;
}

function isProcessStart(v: Json): number | undefined {
  return v.msg === "AuthManager::new" ? nonNeg(v.pid) : undefined;
}

function spawnModel(v: Json): string | undefined {
  return authoritative(get(v, ["ctx", "effective_model"])) ?? authoritative(get(v, ["ctx", "effective_model_raw"]));
}

function terminalModel(v: Json): string | undefined {
  return authoritative(get(v, ["ctx", "effective_model"]));
}

function parentModel(v: Json): [number, string] | undefined {
  const pid = nonNeg(v.pid);
  const ctx = v.ctx;
  if (pid === undefined || !isObj(ctx)) return undefined;
  let model: string | undefined;
  if (v.msg === "subagent read parent config (live)") {
    model = authoritative(ctx.session_model_id) ?? authoritative(ctx.parent_model) ?? authoritative(ctx.global_model_id);
  } else if (v.msg === "subagent model resolved" || v.msg === "subagent spawn credentials") {
    model = authoritative(ctx.parent_model);
  }
  return model ? [pid, model] : undefined;
}

function modelChange(v: Json): [number | undefined, string | undefined, string] | undefined {
  let pid: number | undefined;
  if (v.pid !== undefined) {
    pid = nonNeg(v.pid);
    if (pid === undefined) return undefined;
  }
  const ctx = v.ctx;
  if (!isObj(ctx)) return undefined;
  let model: string | undefined;
  switch (v.msg) {
    case "model changed":
      model = authoritative(ctx.model);
      break;
    case "model catalog: notifying clients":
      model = authoritative(ctx.current_model_id);
      break;
    case "backend_search: model switch":
      model = authoritative(ctx.new_model) ?? authoritative(ctx.model) ?? authoritative(ctx.current_model_id);
      break;
    case "subagent model resolved":
      model = authoritative(ctx.model_id) ?? authoritative(ctx.model);
      break;
  }
  if (!model) return undefined;
  const sid = str(v.sid);
  const session = sid && sid.trim() ? sid : undefined;
  return pid !== undefined || session !== undefined ? [pid, session, model] : undefined;
}

function unifiedKey(sessionId: string, v: Json): string {
  for (const path of [["event_id"], ["eventId"], ["id"], ["uuid"], ["ctx", "event_id"], ["ctx", "eventId"], ["ctx", "id"], ["ctx", "uuid"]]) {
    const id = str(get(v, path));
    if (id && id.trim()) return `grok-unified:${sessionId}:id:${id}`;
  }
  // No event id: the whole row is the discriminator (only ever hashed).
  return `grok-unified:${sessionId}:row:${JSON.stringify(v)}`;
}

/** Session metadata for every session dir, keyed by the session dir name. */
function unifiedSessionMeta(home: string): Map<string, Meta> {
  const out = new Map<string, Meta>();
  const sessions = join(home, "sessions");
  let workspaces: string[];
  try {
    workspaces = readdirSync(sessions).sort();
  } catch {
    return out;
  }
  for (const ws of workspaces) {
    const wsDir = join(sessions, ws);
    let dirs: string[];
    try {
      if (!statSync(wsDir).isDirectory()) continue;
      dirs = readdirSync(wsDir).sort();
    } catch {
      continue;
    }
    for (const id of dirs) {
      const dir = join(wsDir, id);
      try {
        if (!statSync(dir).isDirectory() || !id.trim()) continue;
      } catch {
        continue;
      }
      const updates = join(dir, "updates.jsonl");
      const fallbackTs = existsSync(updates) ? mtimeMs(updates) : mtimeMs(dir);
      out.set(id, readSessionMeta(dir, id, fallbackTs));
    }
  }
  return out;
}

function parseJsonLines(path: string): Json[] {
  const out: Json[] = [];
  for (const raw of lines(path)) {
    if (!raw.trim()) continue;
    try {
      const v = JSON.parse(raw) as unknown;
      if (isObj(v)) out.push(v);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export function parseGrokUnified(path: string, home: string): Row[] {
  const fallbackTs = mtimeMs(path);
  const rows = parseJsonLines(path);

  // Pass 1: subagent evidence.
  const known = new Set<Scope>();
  const childModels = new Map<Scope, Evidence>();
  const terminalScopes = new Set<Scope>();
  const terminalModels = new Map<Scope, Evidence>();
  const childSessions = new Set<string>();
  {
    const gens = new Map<number, number>();
    for (const v of rows) {
      const start = isProcessStart(v);
      if (start !== undefined) {
        gens.set(start, (gens.get(start) ?? 0) + 1);
        continue;
      }
      const isSpawn = v.msg === "subagent spawn credentials";
      const isTerminal = v.msg === "subagent completed" || v.msg === "subagent failed";
      if (!isSpawn && !isTerminal) continue;
      const sub = subagentId(v);
      if (!sub) continue;
      childSessions.add(sub);
      const pid = nonNeg(v.pid);
      if (pid === undefined) continue;
      const scope = `${pid}|${gens.get(pid) ?? 0}|${sub}`;
      known.add(scope);
      if (isTerminal) terminalScopes.add(scope);
      const m = isSpawn ? spawnModel(v) : terminalModel(v);
      if (!m) continue;
      record(childModels, scope, m);
      if (isTerminal) record(terminalModels, scope, m);
    }
  }
  const uniqueChild = (s: Scope): string | undefined => childModels.get(s) ?? undefined;
  const uniqueTerminal = (s: Scope): string | undefined => {
    if (!terminalScopes.has(s)) return undefined;
    const t = terminalModels.get(s);
    const c = uniqueChild(s);
    return t && c && t === c ? c : undefined;
  };
  const conflicted = (s: Scope): boolean => childModels.get(s) === null || terminalModels.get(s) === null;

  // Pass 2.
  const meta = unifiedSessionMeta(home);
  const gens = new Map<number, number>();
  const gen = (pid: number): number => gens.get(pid) ?? 0;
  const fallbackByPid = new Map<string, string>(); // `${pid}|${gen}`
  const byPidSession = new Map<Scope, string>();
  const bySession = new Map<string, string>();
  const seen = new Set<string>();
  const out: Row[] = [];

  for (const v of rows) {
    const start = isProcessStart(v);
    if (start !== undefined) {
      gens.set(start, gen(start) + 1);
      continue;
    }

    const msg = v.msg;
    if (msg === "subagent read parent config (live)") {
      const pm = parentModel(v);
      if (pm) fallbackByPid.set(`${pm[0]}|${gen(pm[0])}`, pm[1]);
      continue;
    }
    if (msg === "subagent model resolved") {
      const pm = parentModel(v);
      if (pm) {
        fallbackByPid.set(`${pm[0]}|${gen(pm[0])}`, pm[1]);
        continue;
      }
    }
    if (msg === "subagent spawn credentials") {
      const pm = parentModel(v);
      if (pm) fallbackByPid.set(`${pm[0]}|${gen(pm[0])}`, pm[1]);
      const pid = nonNeg(v.pid);
      const sub = subagentId(v);
      if (pid !== undefined && sub) {
        const scope = `${pid}|${gen(pid)}|${sub}`;
        const m = spawnModel(v);
        if (m && uniqueChild(scope) === m && !byPidSession.has(scope)) byPidSession.set(scope, m);
      }
      continue;
    }
    if (msg === "subagent completed" || msg === "subagent failed") {
      const pid = nonNeg(v.pid);
      const sub = subagentId(v);
      if (pid !== undefined && sub) {
        const scope = `${pid}|${gen(pid)}|${sub}`;
        const m = terminalModel(v);
        if (m && uniqueTerminal(scope) === m && !byPidSession.has(scope)) byPidSession.set(scope, m);
      }
      continue;
    }

    const change = modelChange(v);
    if (change) {
      const [pid, session, model] = change;
      if (pid !== undefined && session !== undefined) {
        byPidSession.set(`${pid}|${gen(pid)}|${session}`, model);
      } else if (session !== undefined) {
        for (const k of [...byPidSession.keys()]) {
          const ks = k.split("|").slice(2).join("|");
          if (ks === session && !childSessions.has(ks)) byPidSession.delete(k);
        }
        bySession.set(session, model);
      } else if (pid !== undefined) {
        fallbackByPid.set(`${pid}|${gen(pid)}`, model);
      }
      continue;
    }

    if (msg !== "shell.turn.inference_done") continue;
    const sid = str(v.sid);
    if (!sid || !sid.trim()) continue;
    const ctx = v.ctx;
    if (!isObj(ctx)) continue;
    const prompt = nonNeg(ctx.prompt_tokens);
    const completion = nonNeg(ctx.completion_tokens);
    let cached = optNonNeg(ctx.cached_prompt_tokens);
    const reasoningRaw = optNonNeg(ctx.reasoning_tokens);
    if (prompt === undefined || completion === undefined || cached === undefined || reasoningRaw === undefined) continue;
    cached = Math.min(cached, prompt);
    if (ctx.loop_index !== undefined && nonNeg(ctx.loop_index) === undefined) continue;
    const pid = optNonNeg(v.pid);
    if (pid === undefined) continue;
    const ts = tsOf(v.ts) ?? fallbackTs;
    const reasoning = Math.min(reasoningRaw, completion);
    const key = unifiedKey(sid, v);
    if (seen.has(key)) continue;
    seen.add(key);

    const m = meta.get(sid);
    const g = gen(pid);
    const scope = v.pid !== undefined ? `${pid}|${g}|${sid}` : undefined;
    const isConflicted = scope !== undefined && conflicted(scope);
    const exact = byPidSession.get(`${pid}|${g}|${sid}`);
    let model: string;
    if (isConflicted) model = UNKNOWN_MODEL;
    else if (exact) model = exact;
    else if (scope !== undefined && known.has(scope)) model = uniqueTerminal(scope) ?? UNKNOWN_MODEL;
    else if (childSessions.has(sid)) model = UNKNOWN_MODEL;
    else model = bySession.get(sid) ?? fallbackByPid.get(`${pid}|${g}`) ?? m?.model ?? UNKNOWN_MODEL;

    out.push({
      key,
      sessionId: sid,
      model: model.trim() ? model : UNKNOWN_MODEL,
      ts,
      input: prompt - cached,
      output: completion - reasoning,
      reasoning,
      cacheRead: cached,
      cacheWrite: 0,
      kind: "unified",
      conflicted: isConflicted,
    });
  }
  return out;
}

/** tokscale's `prefer_unified_log_messages`. */
export function preferUnified(rows: Row[]): Row[] {
  const unified = rows.filter((r) => r.kind === "unified");
  if (unified.length === 0) return rows;
  const legacy = rows.filter((r) => r.kind !== "unified");

  // Fill unknown unified models from an unambiguous legacy session model.
  const legacyModels = new Map<string, string | null>();
  for (const r of legacy) {
    if (r.model === UNKNOWN_MODEL) continue;
    if (!legacyModels.has(r.sessionId)) legacyModels.set(r.sessionId, r.model);
    else if (legacyModels.get(r.sessionId) !== r.model) legacyModels.set(r.sessionId, null);
  }
  for (const r of unified) {
    if (r.model === UNKNOWN_MODEL && !r.conflicted) {
      const lm = legacyModels.get(r.sessionId);
      if (lm) r.model = lm;
    }
  }

  const byTotal = new Map<string, number>();
  const byTs = new Map<string, number>();
  for (const r of unified) {
    const a = `${r.sessionId}\u0000${r.ts}\u0000${total(r)}`;
    byTotal.set(a, (byTotal.get(a) ?? 0) + 1);
    const b = `${r.sessionId}\u0000${r.ts}`;
    byTs.set(b, (byTs.get(b) ?? 0) + 1);
  }
  const take = (m: Map<string, number>, k: string): boolean => {
    const n = m.get(k) ?? 0;
    if (n === 0) return false;
    m.set(k, n - 1);
    return true;
  };

  const selected: Row[] = [];
  for (const r of rows) {
    if (r.kind === "unified") {
      selected.push(r);
      continue;
    }
    const covered =
      take(byTotal, `${r.sessionId}\u0000${r.ts}\u0000${total(r)}`) ||
      (r.kind === "fallback" && take(byTs, `${r.sessionId}\u0000${r.ts}`));
    if (!covered) selected.push(r);
  }
  return selected;
}

function grokHome(): string {
  return envDir("BURNLOG_GROK_DIR") ?? envOrHome("GROK_HOME", ".grok");
}

export class GrokAdapter implements Adapter {
  readonly name = "grok" as const;

  detect(): boolean {
    const home = grokHome();
    return existsSync(join(home, "sessions")) || existsSync(join(home, "logs", "unified.jsonl"));
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const home = grokHome();
    if (!existsSync(home)) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "not installed" };
    }

    const updates = walkFiles(join(home, "sessions"), (n) => n === "updates.jsonl").filter((f) => {
      // A session's rollup siblings can change without updates.jsonl moving.
      const dir = dirname(f);
      const newest = Math.max(mtimeMs(f), mtimeMs(join(dir, "signals.json")), mtimeMs(join(dir, "summary.json")));
      return shouldRead(newest, opts.since);
    });
    const unifiedPath = join(home, "logs", "unified.jsonl");
    const hasUnified = existsSync(unifiedPath);

    let rows: Row[] = [];
    let scannedFiles = 0;
    let totalLines = 0;
    for (const f of updates) {
      rows.push(...parseGrokUpdates(f));
      scannedFiles++;
    }
    // The unified log is also read whenever any legacy file is, so legacy rows
    // it already covers are dropped instead of double-counted.
    if (hasUnified && (updates.length > 0 || shouldRead(mtimeMs(unifiedPath), opts.since))) {
      rows.push(...parseGrokUnified(unifiedPath, home));
      scannedFiles++;
      totalLines += lines(unifiedPath).length;
    }
    rows = preferUnified(rows);

    if (scannedFiles === 0 && !existsSync(join(home, "sessions")) && !hasUnified) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0, note: "installed, but no sessions yet" };
    }

    const byId = new Map<string, BurnEvent>();
    for (const r of rows) {
      if (total(r) === 0) continue;
      const requestId = hashId(r.key);
      if (byId.has(requestId)) continue;
      byId.set(requestId, {
        requestId,
        source: this.name,
        model: r.model,
        provider: providerFromModel(r.model),
        inputTokens: r.input,
        outputTokens: r.output + r.reasoning,
        cacheCreationTokens: r.cacheWrite,
        cacheReadTokens: r.cacheRead,
        timestamp: new Date(r.ts).toISOString(),
      });
    }

    const note =
      byId.size === 0 && scannedFiles > 0
        ? "no token usage recorded — this Grok Build version logs none on disk"
        : undefined;
    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines, ...(note ? { note } : {}) };
  }
}

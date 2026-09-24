import { copilotOtelSessionIds } from "./copilot.js";
import { createHash } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import { querySqlite, SqliteUnavailable } from "./sqlite.js";
import {
  bucketTotal,
  copilotRoot,
  dbMtimeMs,
  int,
  normalizeInput,
  parseIsoMs,
  type CopilotRecord,
} from "./copilot-common.js";
import { toBurnEvent } from "./copilot-session-store.js";

/**
 * GitHub Copilot Desktop adapter (tokscale copilot_desktop.rs).
 *
 *   ~/.copilot/data.db                                  lifetime totals per session
 *   ~/.copilot/session-state/<session_id>/events.jsonl  per-run shutdown snapshots
 *
 * (all platforms; BURNLOG_COPILOT_DIR moves ~/.copilot)
 *
 * `data.db`'s `sessions` row carries a LIFETIME total and an immutable
 * `created_at`. `session.shutdown` events in the sidecar log carry their own
 * timestamp and a per-model breakdown, but those numbers are CUMULATIVE
 * snapshots of the SDK's usage tracker, so they are differenced into per-run
 * increments per model (with verbatim-repeat dedupe, a running peak so a
 * lower snapshot adds nothing, and cache reads capped by inclusive-input
 * growth). Each increment is emitted at its shutdown time, bounded by the
 * row's remaining budget; whatever the snapshots don't account for stays on
 * `created_at` as the residual. The row stays authoritative for the total.
 *
 * If the log does not open with `session.start`, its head was lost and the
 * first surviving snapshot is only a baseline (tokscale's conservative rule —
 * re-emitting it would double-count usage already synced under a key this
 * scan can no longer reproduce).
 *
 * `total_input_tokens` includes cache reads; they are moved out of input.
 * The sessions table has no cache-write column; only the shutdown snapshots
 * report cache writes. Only ids, model, token totals and created_at are
 * selected — never `title`. The events log is parsed line by line and only
 * event type, id, timestamp, model names and usage numbers are kept.
 */

type Usage = [number, number, number, number, number]; // input, output, cacheRead, cacheWrite, reasoning

type Shutdown = {
  eventId: string;
  timestampMs: number;
  model: string;
  attributedModel?: string;
  usage: Usage;
};

type SessionMeta = { model?: string; shutdowns: Shutdown[]; consumed: Usage };

const zero = (): Usage => [0, 0, 0, 0, 0];

/** copilot_desktop.rs `parse_iso8601_timestamp_ms`. */
export function desktopTs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 10_000_000_000 ? Math.trunc(v) : Math.trunc(v) * 1000;
  }
  if (typeof v !== "string") return undefined;
  const iso = parseIsoMs(v);
  if (iso !== undefined) return iso;
  return /^-?\d+$/.test(v.trim()) ? desktopTs(Number(v.trim())) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function collectShutdown(event: Record<string, unknown>, rawLine: string, out: Shutdown[]): void {
  const data = event.data;
  const payload = (data && typeof data === "object" ? data : event) as Record<string, unknown>;
  const ts = str(event.timestamp) ?? str(payload.timestamp);
  const timestampMs = ts === undefined ? undefined : desktopTs(ts);
  if (timestampMs === undefined) return;

  // The event's own id survives log rotation; an id-less record falls back to
  // a digest of its content (never its file position).
  const id = str(event.id)?.trim();
  const eventId = id || `anon-${createHash("sha256").update(rawLine).digest("hex")}`;

  const metrics = (payload.modelMetrics ?? event.modelMetrics) as unknown;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return;

  const current = (str(payload.currentModel) ?? str(event.currentModel))?.trim();
  const currentModel = current && current !== "auto" ? current : undefined;

  for (const [rawModel, entry] of Object.entries(metrics as Record<string, unknown>)) {
    const usage = (entry as { usage?: Record<string, unknown> } | null)?.usage;
    if (!usage || typeof usage !== "object") continue;
    const read = (k: string): number => Math.max(0, int(usage[k]) ?? 0);
    const model = rawModel.trim();
    const u: Usage = [
      read("inputTokens"),
      read("outputTokens"),
      read("cacheReadTokens"),
      read("cacheWriteTokens"),
      read("reasoningTokens"),
    ];
    if (u.every((x) => x === 0)) continue;
    out.push({
      eventId,
      timestampMs,
      model,
      attributedModel: model === "" || model === "auto" ? currentModel : model,
      usage: u,
    });
  }
}

/** Cumulative snapshots → per-run increments (tokscale `shutdown_deltas`). */
function shutdownDeltas(snapshots: Shutdown[], completeFromStart: boolean): { deltas: Shutdown[]; consumed: Usage } {
  const seen = new Set<string>();
  const unique = snapshots.filter((s) => {
    const k = `${s.eventId}\u0000${s.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Array.prototype.sort is stable: equal timestamps keep file order.
  unique.sort((a, b) => a.timestampMs - b.timestampMs);

  const peaks = new Map<string, Usage>();
  const deltas: Shutdown[] = [];
  for (const s of unique) {
    const prior = peaks.get(s.model);
    const baseline = prior ? [...prior] : completeFromStart ? zero() : null;
    const peak = prior ?? ([...s.usage] as Usage);
    for (let i = 0; i < 5; i++) peak[i] = Math.max(peak[i], s.usage[i]);
    peaks.set(s.model, peak);
    if (!baseline) continue;

    const d = s.usage.map((v, i) => Math.max(0, v - baseline[i])) as Usage;
    // Input includes cache reads: cache growth can't exceed input growth.
    d[2] = Math.min(d[2], d[0]);
    if (d.every((x) => x === 0)) continue;
    deltas.push({ ...s, usage: d });
  }

  // Hand spare input capacity back to cache reads so the emitted cache total
  // reaches the final high-water, newest increments first.
  for (const [model, peak] of peaks) {
    const target = Math.min(peak[2], peak[0]);
    const assigned = deltas.filter((d) => d.model === model).reduce((a, d) => a + d.usage[2], 0);
    let remaining = Math.max(0, target - assigned);
    for (let i = deltas.length - 1; i >= 0 && remaining > 0; i--) {
      const d = deltas[i];
      if (d.model !== model) continue;
      const moved = Math.min(d.usage[0] - d.usage[2], remaining);
      d.usage[2] += moved;
      remaining -= moved;
    }
  }

  const consumed = zero();
  for (const peak of peaks.values()) for (let i = 0; i < 5; i++) consumed[i] += peak[i];
  return { deltas, consumed };
}

function readSessionMeta(eventsPath: string): SessionMeta {
  const meta: SessionMeta = { shutdowns: [], consumed: zero() };
  let raw: string;
  try {
    raw = readFileSync(eventsPath, "utf8");
  } catch {
    return meta;
  }
  let firstType: string | undefined;
  const snapshots: Shutdown[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(t) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!ev || typeof ev !== "object") continue;
    const type = str(ev.type);
    if (type === undefined) continue;
    firstType ??= type;
    if (type === "session.model_change") {
      const m = str((ev.data as Record<string, unknown> | undefined)?.newModel)?.trim();
      if (m && m !== "auto") meta.model = m;
    } else if (type === "session.shutdown") {
      collectShutdown(ev, t, snapshots);
    }
  }
  const { deltas, consumed } = shutdownDeltas(snapshots, firstType === "session.start");
  meta.shutdowns = deltas;
  meta.consumed = consumed;
  return meta;
}

type SessionRow = {
  id: string;
  model?: string;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  createdAt: unknown;
};

function rowToRecords(root: string, row: SessionRow, fallbackMs: number): CopilotRecord[] {
  const meta = readSessionMeta(join(root, "session-state", row.id, "events.jsonl"));
  const fallbackModel = meta.model ?? (row.model?.trim() || "auto");
  const createdMs = desktopTs(row.createdAt) ?? fallbackMs;

  const out: CopilotRecord[] = [];
  let remIn = Math.max(0, row.input);
  let remOut = Math.max(0, row.output);
  let remCr = Math.max(0, row.cached);
  let remReason = Math.max(0, row.reasoning);
  for (const s of meta.shutdowns) {
    // The sidecar can be flushed before SQLite: never exceed the row.
    const input = Math.min(s.usage[0], remIn);
    const output = Math.min(s.usage[1], remOut);
    const cacheRead = Math.min(s.usage[2], remCr, input);
    const reasoning = Math.min(s.usage[4], remReason);
    remIn -= input;
    remOut -= output;
    remCr -= cacheRead;
    remReason -= reasoning;
    const tokens = normalizeInput(input, output, cacheRead, s.usage[3], reasoning);
    if (bucketTotal(tokens) === 0) continue;
    out.push({
      key: `copilot-desktop:${row.id}:shutdown:${s.eventId}:${s.model}`,
      sessionId: row.id,
      model: s.attributedModel ?? fallbackModel,
      timestampMs: s.timestampMs,
      tokens,
    });
  }

  const c = meta.consumed;
  const residualIn = Math.max(0, row.input - c[0]);
  const residual = normalizeInput(
    residualIn,
    Math.max(0, row.output - c[1]),
    Math.min(Math.max(0, row.cached - c[2]), residualIn),
    0,
    Math.max(0, row.reasoning - c[4]),
  );
  if (bucketTotal(residual) > 0) {
    out.push({
      key: `copilot-desktop:${row.id}`,
      sessionId: row.id,
      model: fallbackModel,
      timestampMs: createdMs,
      tokens: residual,
    });
  }
  return out;
}

const tok = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);

/** Parse `data.db` (+ sidecar logs). Throws SqliteUnavailable; [] when no table. */
export async function parseCopilotDesktop(db: string, fallbackMs = 0): Promise<CopilotRecord[]> {
  let rows;
  try {
    rows = await querySqlite(
      db,
      `SELECT id, model, total_input_tokens, total_output_tokens, total_cached_tokens,
              total_reasoning_tokens, created_at
         FROM sessions
        WHERE total_input_tokens > 0 OR total_output_tokens > 0
           OR total_cached_tokens > 0 OR total_reasoning_tokens > 0`,
    );
  } catch (err) {
    if (err instanceof SqliteUnavailable) throw err;
    return [];
  }
  const root = dirname(db);
  const out: CopilotRecord[] = [];
  for (const r of rows) {
    if (typeof r.id !== "string" || !r.id) continue;
    out.push(
      ...rowToRecords(
        root,
        {
          id: r.id,
          model: typeof r.model === "string" ? r.model : undefined,
          input: tok(r.total_input_tokens),
          output: tok(r.total_output_tokens),
          cached: tok(r.total_cached_tokens),
          reasoning: tok(r.total_reasoning_tokens),
          createdAt: r.created_at,
        },
        fallbackMs,
      ),
    );
  }
  return out;
}

export function desktopDbPath(): string {
  return join(copilotRoot(), "data.db");
}

export class CopilotDesktopAdapter implements Adapter {
  readonly name = "copilot-desktop" as const;

  detect(): boolean {
    return existsSync(desktopDbPath());
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = desktopDbPath();
    const base = { source: this.name, events: [] as BurnEvent[], scannedFiles: 0, totalLines: 0 };
    if (!existsSync(db)) return { ...base, note: "not installed" };
    // Shutdown snapshots land in the sidecar logs as the session ends, and the
    // row is updated with them, so the database's mtime covers both.
    if (!shouldRead(dbMtimeMs(db), opts.since)) return { ...base, note: "unchanged since last sync" };

    let records: CopilotRecord[];
    try {
      const covered = copilotOtelSessionIds();
      records = (await parseCopilotDesktop(db, statSync(db).mtimeMs)).filter((r) => !covered.has(r.sessionId));
    } catch (err) {
      return {
        ...base,
        note: err instanceof SqliteUnavailable ? `detected, but ${err.message}` : "data.db unreadable",
      };
    }
    const byId = new Map<string, BurnEvent>();
    for (const r of records) {
      const e = toBurnEvent(this.name, r);
      if (!byId.has(e.requestId)) byId.set(e.requestId, e);
    }
    return { ...base, events: [...byId.values()], scannedFiles: 1, totalLines: records.length };
  }
}

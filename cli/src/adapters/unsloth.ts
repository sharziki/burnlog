import { existsSync, statSync } from "fs";
import { join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, envOrHome, num } from "./fileutil.js";
import { querySqlite, SqliteUnavailable, type Row } from "./sqlite.js";

/**
 * Unsloth Studio adapter — `studio.db` under the Studio home:
 *
 *   ~/.unsloth/studio/studio.db          ($UNSLOTH_STUDIO_HOME honoured)
 *
 * Two content-free usage sources (ported from tokscale `sessions/unsloth.rs`):
 *   - `chat_messages` (role = 'assistant'): usage lives in `metadata_json` at
 *     `$.contextUsage.{promptTokens,completionTokens,totalTokens,cachedTokens,
 *     cacheWriteTokens}`, model at `$.responseDetails.responseModelId` →
 *     `$.contextUsage.modelId` → the thread's `model_id`. SQLite extracts only
 *     those scalars; message content and previews never leave the database.
 *   - `api_usage_events`: authenticated external API calls, prompt/completion/
 *     total only. Absent on older Studio builds.
 *
 * Tokens: cache read/write are clamped into the prompt and fresh input is
 * max(total, prompt+completion) − completion − cache. Output is the whole
 * completion (reasoning included).
 *
 * `providerType` "local" (and the API table) is local inference → provider
 * "other"; anthropic/openai/gemini map across; anything else falls back to the
 * model-name heuristic.
 *
 * Override the Studio home with BURNLOG_UNSLOTH_DIR (or UNSLOTH_STUDIO_HOME).
 */

function studioHome(): string {
  return envDir("BURNLOG_UNSLOTH_DIR") ?? envOrHome("UNSLOTH_STUDIO_HOME", ".unsloth", "studio");
}

const CHAT_SQL = `
  SELECT m.id AS id, m.created_at AS created_at,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.promptTokens') END AS prompt,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.completionTokens') END AS completion,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.totalTokens') END AS total,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.cachedTokens') END AS cached,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.cacheWriteTokens') END AS cache_write,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.contextUsage.modelId') END AS requested_model,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.responseDetails.responseModelId') END AS response_model,
    CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json, '$.responseDetails.providerType') END AS provider_type,
    t.model_id AS thread_model
  FROM chat_messages m
  LEFT JOIN chat_threads t ON t.id = m.thread_id
  WHERE m.role = 'assistant'
  ORDER BY m.created_at, m.id`;

const API_SQL = `
  SELECT id, model, prompt_tokens AS prompt, completion_tokens AS completion,
         total_tokens AS total, created_at
  FROM api_usage_events
  ORDER BY created_at, id`;

function nonBlank(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function tokens(prompt: unknown, completion: unknown, total: unknown, cached: unknown, cacheWrite: unknown) {
  const p = num(prompt);
  const c = num(completion);
  const cacheRead = Math.min(num(cached), p);
  const write = Math.min(num(cacheWrite), Math.max(0, p - cacheRead));
  const t = Math.max(num(total), p + c);
  if (t === 0) return null;
  return { input: Math.max(0, t - c - cacheRead - write), output: c, cacheRead, cacheWrite: write };
}

/** `created_at` is epoch seconds or milliseconds (tokscale's 1e12 rule). */
function tsMs(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
}

function provider(providerType: unknown, model: string): BurnEvent["provider"] {
  const t = nonBlank(providerType)?.toLowerCase();
  if (t === "local") return "other";
  if (t === "anthropic" || t === "openai") return t;
  if (t === "gemini") return "google";
  return providerFromModel(model);
}

export class UnslothAdapter implements Adapter {
  readonly name = "unsloth" as const;

  private get dbPath(): string {
    return join(studioHome(), "studio.db");
  }

  detect(): boolean {
    return existsSync(this.dbPath);
  }

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const db = this.dbPath;
    const empty = (note: string, scannedFiles = 0): ScanResult => ({
      source: this.name,
      events: [],
      scannedFiles,
      totalLines: 0,
      note,
    });
    if (!existsSync(db)) return empty("not installed");

    // WAL-mode databases take writes in the -wal file first.
    const mtime = Math.max(...[db, `${db}-wal`].map((p) => (existsSync(p) ? statSync(p).mtimeMs : 0)));
    if (!shouldRead(mtime, opts.since)) return { source: this.name, events: [], scannedFiles: 0, totalLines: 0 };

    let chat: Row[];
    try {
      chat = await querySqlite(db, CHAT_SQL);
    } catch (err) {
      if (err instanceof SqliteUnavailable) return empty(`detected, but ${err.message}`);
      chat = [];
    }
    let api: Row[] = [];
    try {
      api = await querySqlite(db, API_SQL);
    } catch {
      // Older Studio builds have no api_usage_events table.
    }

    const byId = new Map<string, BurnEvent>();
    for (const r of chat) {
      const t = tokens(r.prompt, r.completion, r.total, r.cached, r.cache_write);
      const ts = tsMs(r.created_at);
      const id = nonBlank(String(r.id ?? ""));
      if (!t || ts <= 0 || !id) continue;
      const model = nonBlank(r.response_model) ?? nonBlank(r.requested_model) ?? nonBlank(r.thread_model) ?? "unknown";
      byId.set(`unsloth:chat:${id}`, {
        requestId: `unsloth:chat:${id}`,
        source: this.name,
        model,
        provider: provider(r.provider_type, model),
        inputTokens: t.input,
        outputTokens: t.output,
        cacheCreationTokens: t.cacheWrite,
        cacheReadTokens: t.cacheRead,
        timestamp: new Date(ts).toISOString(),
      });
    }
    for (const r of api) {
      const t = tokens(r.prompt, r.completion, r.total, 0, 0);
      const ts = tsMs(r.created_at);
      const id = nonBlank(String(r.id ?? ""));
      if (!t || ts <= 0 || !id) continue;
      byId.set(`unsloth:api:${id}`, {
        requestId: `unsloth:api:${id}`,
        source: this.name,
        model: nonBlank(r.model) ?? "unknown",
        provider: "other",
        inputTokens: t.input,
        outputTokens: t.output,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        timestamp: new Date(ts).toISOString(),
      });
    }
    return { source: this.name, events: [...byId.values()], scannedFiles: 1, totalLines: chat.length + api.length };
  }
}

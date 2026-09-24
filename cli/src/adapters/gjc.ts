import { homedir } from "os";
import { basename, join } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import {
  EventSet,
  collectFiles,
  envPath,
  int,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  notInstalled,
  obj,
  opaqueId,
  parseJson,
  parseRfc3339,
  readLines,
} from "./jsonl-kit.js";

/**
 * gajae-code (gjc) — `<agent dir>/sessions/<project-slug>/*.jsonl`, plus
 * per-pass sub-agent children `<slug>/<session>/N-*.jsonl`. Port of tokscale's
 * `sessions/gjc.rs`.
 *
 * Every root tokscale resolves is scanned (not first match), overlaps
 * collapse by file:
 *   `$GJC_CODING_AGENT_DIR/sessions` (default `~/.gjc/agent/sessions`),
 *   `$GJC_CONFIG_DIR/agent/sessions`, `$PI_CONFIG_DIR/agent/sessions`,
 *   `$XDG_DATA_HOME/gjc/sessions` (Linux/macOS; the redirect drops `agent/`),
 *   and `~/.gjc/agent/sessions`.
 *
 * Records: a `session` header (`id`), then `message` entries whose assistant
 * payload carries `usage: {input, output, cacheRead, cacheWrite}` — disjoint
 * buckets, `reasoningTokens` never added — and a unix-ms `timestamp`.
 *
 * Dedupe: `<session id>:<entry id>`, which collapses the depth-1/depth-2
 * replays of one message; without an entry id, a digest of session,
 * timestamp, model, tokens and the line itself.
 *
 * Override every root with BURNLOG_GJC_DIR.
 */
export function gjcRoots(): string[] {
  const explicit = envPath("BURNLOG_GJC_DIR");
  if (explicit) return [explicit];
  const home = homedir();
  const roots = [join(envPath("GJC_CODING_AGENT_DIR") ?? join(home, ".gjc", "agent"), "sessions")];
  for (const v of ["GJC_CONFIG_DIR", "PI_CONFIG_DIR"]) {
    const d = envPath(v)?.trim();
    if (d) roots.push(join(d.replace(/\/+$/, ""), "agent", "sessions"));
  }
  const xdg = envPath("XDG_DATA_HOME")?.trim();
  if (xdg && process.platform !== "win32") roots.push(join(xdg.replace(/\/+$/, ""), "gjc", "sessions"));
  roots.push(join(home, ".gjc", "agent", "sessions"));
  return [...new Set(roots)];
}

export class GjcAdapter implements Adapter {
  readonly name = "gjc" as const;

  detect(): boolean {
    return gjcRoots().some(isDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const { files, anyRoot } = collectFiles(gjcRoots(), (n) => n.endsWith(".jsonl"), opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const fallbackMs = mtimeMs(file);
      let session: string | undefined;
      for (const line of readLines(file)) {
        totalLines++;
        const rec = parseJson(line);
        if (!rec || typeof rec.type !== "string") continue;
        if (rec.type === "session") {
          if (typeof rec.id === "string") session = rec.id;
          continue;
        }
        if (rec.type !== "message") continue;
        const msg = obj(rec.message);
        if (!msg || msg.role !== "assistant") continue;
        const usage = obj(msg.usage);
        if (!usage || typeof msg.model !== "string") continue;
        const model = msg.model;

        const ts =
          typeof msg.timestamp === "number" && Number.isInteger(msg.timestamp)
            ? msg.timestamp
            : (parseRfc3339(rec.timestamp) ?? fallbackMs);
        const tokens = {
          input: int(usage.input),
          output: int(usage.output),
          cacheRead: int(usage.cacheRead),
          cacheWrite: int(usage.cacheWrite),
        };
        const provider = typeof msg.provider === "string" && msg.provider ? msg.provider : undefined;
        const sid = session ?? basename(file, ".jsonl");
        const entryId = typeof rec.id === "string" && rec.id ? rec.id : undefined;
        const key = entryId
          ? `${sid}:${entryId}`
          : `gjc:${sid}:${ts}:${model}:${provider ?? ""}:${tokens.input}-${tokens.output}-${tokens.cacheRead}-${tokens.cacheWrite}:${opaqueId(line)}`;
        events.add(makeEvent(this.name, key, model, mapProvider(provider, model), tokens, ts));
      }
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }
}

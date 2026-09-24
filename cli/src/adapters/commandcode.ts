import { homedir } from "os";
import { basename, dirname, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import {
  EventSet,
  collectFiles,
  envPath,
  isDir,
  makeEvent,
  mapProvider,
  mtimeMs,
  notInstalled,
  obj,
  optInt,
  parseJson,
  parseRfc3339,
  readLines,
} from "./jsonl-kit.js";

/**
 * Command Code — `~/.commandcode/projects/<slug>/<session>.jsonl` (same path
 * on every OS). Port of tokscale's `sessions/commandcode.rs`.
 *
 * v3 transcripts are typed records: a `session` header, `model_change`
 * events, and `message` entries. Assistant responses carry
 *
 *   "usage": {"inputTokens","outputTokens","cacheReadTokens","cacheWriteTokens","costUsd"}
 *   "model": "provider/model"
 *
 * The buckets are DISJOINT (inputTokens is cache-exclusive; the vendor's own
 * costUsd only reproduces that way), so they pass through verbatim.
 *
 * The transcript is a tree: `/rewind` leaves abandoned assistant entries on
 * disk. Only the active branch — the parentId chain from the last entry —
 * counts, as in the vendor's own stats. If that chain names an ancestor the
 * file doesn't contain (a skipped line), nothing is filtered: re-counting an
 * abandoned branch is bounded, dropping every earlier turn is not.
 *
 * `/fork` copies entries into a new file, so the key is entry id + the
 * entry's own timestamp, which collapses the copies across files.
 *
 * Model: the line's own `model`, else the last `model_change`, else
 * `config.json` `model` next to `projects/`, else "unknown"; the gateway org
 * prefix is dropped (`MiniMaxAI/MiniMax-M3-Free` → `MiniMax-M3-Free`).
 *
 * Not ported: tokscale's ~4 chars/token ESTIMATE for legacy transcripts with no
 * usage block — it measures message text, which burnlog does not read.
 * `<session>.checkpoints.jsonl` snapshot logs are skipped.
 *
 * Override the scan root with BURNLOG_COMMANDCODE_DIR.
 */

const CEILING = 1_000_000_000_000;

function configModel(file: string): string | undefined {
  let dir = dirname(file);
  while (basename(dir) !== "projects") {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  const lines = readLines(join(dirname(dir), "config.json"));
  const model = lines.length ? parseJson(lines.join("\n"))?.model : undefined;
  return typeof model === "string" && model.trim() ? model : undefined;
}

/** Entry ids on the active branch, or null when it can't be reconstructed. */
function activeBranch(parents: Map<string, string | null>, last: string | undefined): Set<string> | null {
  if (!last) return null;
  const branch = new Set<string>();
  let current = last;
  for (;;) {
    if (branch.has(current)) return branch;
    branch.add(current);
    if (!parents.has(current)) return null;
    const parent = parents.get(current);
    if (!parent) return branch;
    current = parent;
  }
}

export class CommandcodeAdapter implements Adapter {
  readonly name = "commandcode" as const;

  private get root(): string {
    return envPath("BURNLOG_COMMANDCODE_DIR") ?? join(homedir(), ".commandcode", "projects");
  }

  detect(): boolean {
    return isDir(this.root);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const match = (n: string): boolean => n.endsWith(".jsonl") && !n.endsWith(".checkpoints.jsonl");
    const { files, anyRoot } = collectFiles([this.root], match, opts);
    if (!anyRoot) return notInstalled(this.name);

    const events = new EventSet();
    let totalLines = 0;
    for (const file of files) {
      const lines = readLines(file);
      totalLines += lines.length;
      for (const e of this.parseFile(file, lines)) events.add(e);
    }
    return { source: this.name, events: events.values(), scannedFiles: files.length, totalLines };
  }

  private parseFile(file: string, lines: string[]): BurnEvent[] {
    const fallbackMs = mtimeMs(file);
    const cfgModel = configModel(file);
    const pathSession = basename(file, ".jsonl");
    let session: string | undefined;
    let model: string | undefined;
    const parents = new Map<string, string | null>();
    let last: string | undefined;
    const emitted: Array<{ e: BurnEvent; entryId?: string }> = [];
    let assistantIndex = 0;

    for (const line of lines) {
      const rec = parseJson(line);
      if (!rec) continue;
      const id = typeof rec.id === "string" && rec.id ? rec.id : undefined;
      if (rec.type === "session") {
        if (id) session = id;
      } else if (!session && typeof rec.sessionId === "string" && rec.sessionId) {
        session = rec.sessionId;
      }
      if (typeof rec.model === "string" && rec.model) model = rec.model;
      if (id) {
        parents.set(id, typeof rec.parentId === "string" && rec.parentId ? rec.parentId : null);
        last = id;
      }
      if (rec.type === "model_change") continue;

      const message = obj(rec.message);
      const role = message ? message.role : rec.role;
      if (role !== "assistant") continue;

      const usage = obj(rec.usage);
      if (!usage) continue; // legacy estimate not ported
      const fields = [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].map(optInt);
      if (fields.every((f) => f === undefined)) continue;
      const [input, output, cacheRead, cacheWrite] = fields.map((f) => Math.min(f ?? 0, CEILING));

      const rawModel = model ?? cfgModel ?? "unknown";
      const resolved = rawModel.split("/").pop() || rawModel;
      const ownMs = parseRfc3339(rec.timestamp);
      const sid = session ?? pathSession;
      const key = id ? `${id}:${ownMs ?? -1}` : `${dirname(file)}:${sid}:${assistantIndex}`;
      const e = makeEvent(
        this.name,
        key,
        resolved,
        mapProvider(undefined, rawModel),
        { input, output, cacheRead, cacheWrite },
        ownMs ?? fallbackMs,
      );
      assistantIndex++;
      if (e) emitted.push({ e, entryId: id });
    }

    const branch = activeBranch(parents, last);
    return emitted.filter(({ entryId }) => !branch || !entryId || branch.has(entryId)).map(({ e }) => e);
  }
}

import { realpathSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join } from "path";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { shouldRead } from "./types.js";
import {
  type Buckets,
  collectFiles,
  envPath,
  isDir,
  makeEvent,
  mtimeMs,
  notInstalled,
  parseJson,
  readLines,
} from "./jsonl-kit.js";
import { type PiFile, type PiMessage, parsePiFile } from "./pi-format.js";

/**
 * Prime Agent (PrimeIntellect) — Pi session format (pi-format.ts), read with
 * tokscale's lossy Prime lane, plus Prime's RLM child accounting.
 *
 * Root sessions: `<agent dir>/sessions/*.jsonl`; RLM child sessions: the
 * sibling `session-artifacts/` tree (`rlm-subagents.jsonl` indexes are not
 * transcripts and are skipped). Agent dir is `$PRIME_AGENT_CODING_AGENT_DIR`,
 * default `~/.prime/agent`; the session dir can move independently via
 * `$PRIME_AGENT_SESSION_DIR` / `$PRIME_AGENT_CODING_AGENT_SESSION_DIR` or
 * `sessionDir` in `settings.json` (project `.prime/agent/settings.json` wins
 * over the agent dir's), exactly as tokscale resolves it.
 *
 * Why accounting: a child's own transcript is scanned directly, but Prime may
 * also persist the parent turn's usage as an AGGREGATE that already includes
 * that child, announcing it with `child_usage_attributed` records
 * ({targetId, childUsage, aggregateUsage}). The parent row is reduced by the
 * childUsage of every attribution whose child transcript was actually found
 * (same parent lineage, same usage, completion within 1 s); unmatched
 * attributions stay in the parent so nothing is lost. tokscale settles ties
 * with a min-cost maximum matching; this uses a cost-ordered greedy matching,
 * which agrees whenever timestamps disambiguate.
 *
 * Because that accounting spans files, an incremental sync that finds any
 * changed file re-reads the whole tree rather than a subset.
 *
 * Override the agent dir with BURNLOG_PRIME_AGENT_DIR.
 */

const TOLERANCE_MS = 1000;

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function readSessionDir(settings: string): { set: boolean; value: string | null } {
  const lines = readLines(settings);
  if (!lines.length) return { set: false, value: null };
  const json = parseJson(lines.join("\n"));
  if (!json || !("sessionDir" in json)) return { set: false, value: null };
  const v = json.sessionDir;
  if (v === null) return { set: true, value: null };
  if (typeof v === "string") return { set: true, value: v };
  return { set: false, value: null };
}

export function primeRoots(): string[] {
  const withArtifacts = (sessions: string): string[] => [sessions, join(dirname(sessions), "session-artifacts")];

  const explicit = envPath("BURNLOG_PRIME_AGENT_DIR");
  if (explicit) return [join(explicit, "sessions"), join(explicit, "session-artifacts")];

  const override = process.env.PRIME_AGENT_SESSION_DIR || process.env.PRIME_AGENT_CODING_AGENT_SESSION_DIR;
  if (override) return withArtifacts(expandTilde(override));

  const agentDir = expandTilde(process.env.PRIME_AGENT_CODING_AGENT_DIR || join(homedir(), ".prime", "agent"));
  const project = readSessionDir(join(process.cwd(), ".prime", "agent", "settings.json"));
  const setting = project.set ? project : readSessionDir(join(agentDir, "settings.json"));
  if (setting.set && setting.value !== null) {
    if (setting.value === "") return [process.cwd(), join(process.cwd(), "session-artifacts")];
    return withArtifacts(expandTilde(setting.value));
  }
  return [join(agentDir, "sessions"), join(agentDir, "session-artifacts")];
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const usageKey = (b: Buckets): string => `${b.input}:${b.output}:${b.cacheRead}:${b.cacheWrite}`;
const sameUsage = (a: Buckets, b: Buckets): boolean => usageKey(a) === usageKey(b);

function maxInto(t: Buckets, u: Buckets): void {
  t.input = Math.max(t.input, u.input);
  t.output = Math.max(t.output, u.output);
  t.cacheRead = Math.max(t.cacheRead, u.cacheRead);
  t.cacheWrite = Math.max(t.cacheWrite, u.cacheWrite);
}

function subInto(t: Buckets, u: Buckets): void {
  t.input = Math.max(0, t.input - u.input);
  t.output = Math.max(0, t.output - u.output);
  t.cacheRead = Math.max(0, t.cacheRead - u.cacheRead);
  t.cacheWrite = Math.max(0, t.cacheWrite - u.cacheWrite);
}

function addInto(t: Buckets, u: Buckets): void {
  t.input += u.input;
  t.output += u.output;
  t.cacheRead += u.cacheRead;
  t.cacheWrite += u.cacheWrite;
}

/** The entry-id fallback key minus its four token fields. */
function fallbackBase(key: string): string | undefined {
  if (!key.startsWith("prime-agent:message:")) return undefined;
  const parts = key.split(":");
  return parts.length > 6 ? parts.slice(0, -4).join(":") : undefined;
}

type Accounting = {
  source: string;
  childParent?: string;
  forkParent?: string;
  attributions: Array<{ id: string; timestampMs?: number; childUsage: Buckets }>;
  adjustments: Array<{ key: string; persisted: Buckets; prefix: Array<{ id: string; childUsage: Buckets }> }>;
  childUsages: Array<{ timestampMs?: number; usage: Buckets }>;
};

function accountFor(file: string, parsed: PiFile): Accounting {
  const source = real(file);
  const parent = parsed.header.parentSession;
  const parentPath =
    parent && !parent.includes("�") ? real(isAbsolute(parent) ? parent : join(dirname(file), parent)) : undefined;
  const isChild = parsed.header.rlmDepth > 0;

  const targets = new Map<string, PiMessage>();
  for (const m of parsed.messages) if (m.entryId) targets.set(m.entryId, m);

  const byTarget = new Map<string, PiFile["attributions"]>();
  for (const a of parsed.attributions) {
    const list = byTarget.get(a.targetId) ?? [];
    list.push(a);
    byTarget.set(a.targetId, list);
  }

  const adjustments: Accounting["adjustments"] = [];
  for (const [targetId, entries] of byTarget) {
    const target = targets.get(targetId);
    if (!target) continue;
    let last = -1;
    entries.forEach((e, i) => {
      if (sameUsage(e.aggregateUsage, target.tokens)) last = i;
    });
    if (last >= 0) {
      adjustments.push({
        key: target.key,
        persisted: target.tokens,
        prefix: entries.slice(0, last + 1).map((e) => ({ id: e.id, childUsage: e.childUsage })),
      });
    }
  }

  return {
    source,
    childParent: isChild ? parentPath : undefined,
    forkParent: isChild ? undefined : parentPath,
    attributions: parsed.attributions.map((a) => ({ id: a.id, timestampMs: a.timestampMs, childUsage: a.childUsage })),
    adjustments,
    childUsages: isChild ? parsed.messages.map((m) => ({ timestampMs: m.recordedMs, usage: m.tokens })) : [],
  };
}

/** Head of each file's fork chain; a loop resolves to its smallest member. */
function lineageRoots(accounting: Accounting[]): Map<string, string> {
  const forkedFrom = new Map<string, string>();
  for (const a of accounting) if (a.forkParent) forkedFrom.set(a.source, a.forkParent);
  const roots = new Map<string, string>();
  for (const a of accounting) {
    const chain: string[] = [];
    const pos = new Map<string, number>();
    let node = a.source;
    let root: string;
    for (;;) {
      const known = roots.get(node);
      if (known) {
        root = known;
        break;
      }
      const entered = pos.get(node);
      if (entered !== undefined) {
        root = chain.slice(entered).sort()[0] ?? node;
        break;
      }
      pos.set(node, chain.length);
      chain.push(node);
      const parent = forkedFrom.get(node);
      if (!parent) {
        root = node;
        break;
      }
      node = parent;
    }
    for (const m of chain) roots.set(m, root);
    if (!roots.has(a.source)) roots.set(a.source, root);
  }
  return roots;
}

/** Port of tokscale's `reconcile_prime_agent_messages`. */
export function reconcilePrime(
  messages: PiMessage[],
  accounting: Accounting[],
): Array<{ identity: string; message: PiMessage; tokens: Buckets }> {
  // Child responses available to explain an attribution, by parent + usage.
  const children = new Map<string, Array<number | undefined>>();
  for (const f of accounting) {
    if (!f.childParent) continue;
    for (const c of f.childUsages) {
      const k = `${f.childParent}\u0000${usageKey(c.usage)}`;
      const list = children.get(k) ?? [];
      list.push(c.timestampMs);
      children.set(k, list);
    }
  }

  const roots = lineageRoots(accounting);
  const lineageOf = (f: Accounting): string => roots.get(f.source) ?? f.source;
  const attributions = new Map<string, { usage: Buckets; ts?: number; owners: Set<string> }>();
  for (const f of accounting) {
    const lineage = lineageOf(f);
    for (const a of f.attributions) {
      const k = `${lineage}\u0000${a.id}`;
      let entry = attributions.get(k);
      if (!entry) {
        entry = { usage: a.childUsage, ts: a.timestampMs, owners: new Set() };
        attributions.set(k, entry);
      }
      entry.owners.add(f.source);
      entry.owners.add(lineage);
      if (f.forkParent) entry.owners.add(f.forkParent);
    }
  }

  // Candidate pairings, cheapest (closest in time) first; each child response
  // and each attribution is used at most once.
  const pairs: Array<{ cost: number; attr: string; child: string }> = [];
  for (const [attr, a] of attributions) {
    for (const owner of a.owners) {
      const k = `${owner}\u0000${usageKey(a.usage)}`;
      (children.get(k) ?? []).forEach((childTs, i) => {
        const child = `${k}\u0000${i}`;
        if (a.ts !== undefined && childTs !== undefined) {
          const d = Math.abs(a.ts - childTs);
          if (d <= TOLERANCE_MS) pairs.push({ cost: d, attr, child });
        } else if (a.ts === undefined && childTs === undefined) {
          pairs.push({ cost: TOLERANCE_MS + 1, attr, child });
        }
      });
    }
  }
  pairs.sort((x, y) => x.cost - y.cost || (x.attr < y.attr ? -1 : x.attr > y.attr ? 1 : 0));
  const represented = new Set<string>();
  const usedChildren = new Set<string>();
  for (const p of pairs) {
    if (represented.has(p.attr) || usedChildren.has(p.child)) continue;
    represented.add(p.attr);
    usedChildren.add(p.child);
  }

  const adjustmentGroups = new Map<string, Array<{ lineage: string; adj: Accounting["adjustments"][number] }>>();
  const fallbackBases = new Set<string>();
  for (const f of accounting) {
    for (const adj of f.adjustments) {
      const base = fallbackBase(adj.key);
      if (base) fallbackBases.add(base);
      const identity = base ?? adj.key;
      const list = adjustmentGroups.get(identity) ?? [];
      list.push({ lineage: lineageOf(f), adj });
      adjustmentGroups.set(identity, list);
    }
  }

  const groups = new Map<string, PiMessage[]>();
  for (const m of messages) {
    const base = fallbackBase(m.key);
    const identity = base && fallbackBases.has(base) ? base : m.key;
    const list = groups.get(identity) ?? [];
    list.push(m);
    groups.set(identity, list);
  }

  const out: Array<{ identity: string; message: PiMessage; tokens: Buckets }> = [];
  for (const [identity, group] of groups) {
    const adjustments = adjustmentGroups.get(identity);
    const tokens: Buckets = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    if (!adjustments) {
      for (const m of group) maxInto(tokens, m.tokens);
      out.push({ identity, message: group[0], tokens });
      continue;
    }

    let foundBase = false;
    const all = new Map<string, Buckets>();
    for (const { lineage, adj } of adjustments) {
      const own = { ...adj.persisted };
      for (const a of adj.prefix) {
        subInto(own, a.childUsage);
        const k = `${lineage}\u0000${a.id}`;
        if (!all.has(k)) all.set(k, a.childUsage);
      }
      maxInto(tokens, own);
      foundBase = true;
    }
    for (const m of group) {
      const isAggregateCopy = adjustments.some(({ adj }) => m.key === adj.key && sameUsage(m.tokens, adj.persisted));
      if (!isAggregateCopy) {
        maxInto(tokens, m.tokens);
        foundBase = true;
      }
    }
    if (!foundBase) for (const m of group) maxInto(tokens, m.tokens);
    for (const [k, usage] of all) if (!represented.has(k)) addInto(tokens, usage);
    out.push({ identity, message: group[0], tokens });
  }
  return out;
}

export class PrimeAgentAdapter implements Adapter {
  readonly name = "prime-agent" as const;

  detect(): boolean {
    return primeRoots().some(isDir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const match = (name: string): boolean => name.endsWith(".jsonl") && name !== "rlm-subagents.jsonl";
    const { files, anyRoot } = collectFiles(primeRoots(), match, {});
    if (!anyRoot) return notInstalled(this.name);
    if (opts.since && !files.some((f) => shouldRead(mtimeMs(f), opts.since))) {
      return { source: this.name, events: [], scannedFiles: 0, totalLines: 0 };
    }

    const messages: PiMessage[] = [];
    const accounting: Accounting[] = [];
    let totalLines = 0;
    for (const file of files) {
      const parsed = parsePiFile(file, this.name, "prime");
      if (!parsed) continue;
      totalLines += parsed.lines;
      messages.push(...parsed.messages);
      accounting.push(accountFor(file, parsed));
    }

    const events: BurnEvent[] = [];
    for (const r of reconcilePrime(messages, accounting)) {
      const e = makeEvent(this.name, r.identity, r.message.model, r.message.provider, r.tokens, r.message.timestampMs);
      if (e) events.push(e);
    }
    return { source: this.name, events, scannedFiles: files.length, totalLines };
  }
}

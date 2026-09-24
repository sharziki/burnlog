import pc from "picocolors";
import { spawn } from "child_process";
import { loadConfig, saveConfig } from "../config.js";
import { adapters, scanAll, totalTokens, splitOversized } from "../adapters/index.js";
import { ingest, fetchRank } from "../api.js";
import { formatTokens } from "../format.js";

const BATCH = 500;

export async function sync(args: string[]): Promise<void> {
  // Hand the work to a detached child and return at once. Hooks fire as their
  // host exits, and a sync still walking log files gets killed with it. Node's
  // `detached` is setsid() on Unix and a new process group on Windows, which
  // the old `(setsid … &)` hook could only do on Linux.
  if (args.includes("--background")) {
    const rest = args.filter((a) => a !== "--background");
    spawn(process.execPath, [process.argv[1], "sync", ...rest, ...(rest.includes("--quiet") ? [] : ["--quiet"])], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  // `burnlog sync me` reads like a sentence and people will type it. Sync,
  // then show the long-range report rather than complaining about an argument.
  if (args[0] === "me") {
    await syncOnly(args.slice(1));
    const { me } = await import("./me.js");
    await me(args.slice(1));
    return;
  }
  return syncOnly(args);
}

export type SourceSummary = { source: string; events: number; tokens: number; note?: string };

export type SyncResult = {
  inserted: number;
  skipped: number;
  /** Every adapter, including the ones that found nothing (with the reason in `note`). */
  sources: SourceSummary[];
  /** Total tokens across every uploaded event. */
  total: number;
};

export type SyncHooks = {
  /** After the scan, before any upload. Not called when nothing was found. */
  onScan?: (r: { events: number; sources: SourceSummary[]; total: number }) => void;
  onBatchStart?: (from: number, to: number, of: number) => void;
  onBatchDone?: () => void;
};

/**
 * The core of `burnlog sync`: scan, upload, record progress. Prints nothing —
 * callers decide what to show. Throws if an upload fails (config is then left
 * untouched, so the next run retries the same range).
 */
export async function runSync(opts: { full?: boolean } = {}, hooks: SyncHooks = {}): Promise<SyncResult> {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error("no api key — run burnlog login <key>");
  // Incremental by default: only re-read logs touched since the last sync.
  // A full re-read of years of history took long enough that the Claude Code
  // session-end hook was cancelled mid-run. Server-side dedupe means a full
  // scan is never *wrong*, just slow, so `--full` stays available for when
  // history needs rebuilding (e.g. after an adapter fix).
  const since = opts.full ? undefined : cfg.lastSync ? new Date(cfg.lastSync) : undefined;
  // Sources this machine has never fully read — new in this version, typically
  // — get their whole history this once. Configs from before this field
  // existed had fully read the original six.
  const backfilled = new Set(
    cfg.backfilled ?? ["claude-code", "codex", "hermes", "openclaw", "opencode", "jsonl"],
  );
  const fullFor = new Set(adapters.map((a) => a.name).filter((n) => !backfilled.has(n)));
  const results = await scanAll({ since }, fullFor);
  const sources: SourceSummary[] = results.map((r) => ({
    source: r.source,
    events: r.events.length,
    tokens: r.events.reduce((s, e) => s + totalTokens(e), 0),
    ...(r.note ? { note: r.note } : {}),
  }));
  // Session aggregates can exceed the server's per-event storage ceiling;
  // split them so the tokens are kept rather than rejected.
  const events = results.flatMap((r) => r.events).flatMap(splitOversized);
  if (!events.length) return { inserted: 0, skipped: 0, sources, total: 0 };

  const total = events.reduce((s, e) => s + totalTokens(e), 0);
  hooks.onScan?.({ events: events.length, sources, total });

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    hooks.onBatchStart?.(i + 1, i + chunk.length, events.length);
    const res = await ingest(cfg.apiUrl, cfg.apiKey, chunk);
    inserted += res.inserted;
    skipped += res.skipped;
    hooks.onBatchDone?.();
  }

  cfg.lastSync = new Date().toISOString();
  // Only a source that actually produced events counts as backfilled: one
  // that was signed out or empty today must get its full read when it has data.
  cfg.backfilled = [...new Set([...backfilled, ...results.filter((r) => r.events.length).map((r) => r.source)])];
  saveConfig(cfg);

  return { inserted, skipped, sources, total };
}

async function syncOnly(args: string[]): Promise<void> {
  const quiet = args.includes("--quiet") || args.includes("-q");
  const log = (msg: string) => {
    if (!quiet) console.log(msg);
  };
  const write = (msg: string) => {
    if (!quiet) process.stdout.write(msg);
  };

  const cfg = loadConfig();
  if (!cfg.apiKey) {
    if (quiet) process.exit(0); // silent no-op when run from a hook before login
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login <key>"));
    process.exit(1);
  }

  let result: SyncResult;
  try {
    result = await runSync(
      { full: args.includes("--full") },
      {
        onScan: ({ events, sources, total }) => {
          log("found " + pc.cyan(events.toString()) + " events across adapters:");
          for (const r of sources) {
            if (!r.events) continue;
            log("  " + pc.green("●") + " " + pc.bold(r.source.padEnd(14)) + pc.yellow(formatTokens(r.tokens)));
          }
          log(pc.dim("total: ") + pc.yellow(formatTokens(total)));
          log("");
        },
        onBatchStart: (from, to, of) => write(pc.dim(`  uploading ${from}-${to} / ${of}... `)),
        onBatchDone: () => write(pc.green("ok\n")),
      },
    );
  } catch (err) {
    if (quiet) process.exit(0); // hook context — fail silently
    process.stdout.write(pc.red("fail\n"));
    console.error("  " + pc.red(String(err)));
    process.exit(1);
  }

  if (!result.sources.some((r) => r.events)) {
    if (quiet) return;
    console.log(pc.yellow("no events found across any adapter"));
    for (const r of result.sources) {
      console.log("  " + pc.dim(r.source + ": ") + pc.dim(r.note ?? "0 events"));
    }
    return;
  }
  const { inserted, skipped } = result;

  log("");
  log(pc.green("✓ sync complete"));
  log("  inserted " + pc.cyan(inserted.toString()));
  log("  skipped  " + pc.dim(skipped.toString()) + pc.dim(" (already seen)"));

  // Fetch and display leaderboard position
  if (!quiet) {
    const rank = await fetchRank(cfg.apiUrl, cfg.apiKey);
    if (rank) {
      log("");
      log(
        "  " +
          pc.bold(`@${rank.username}`) +
          pc.dim(" · ") +
          pc.yellow(`${rank.rankIcon} ${rank.rank}`) +
          pc.dim(" · ") +
          pc.cyan(formatTokens(rank.totalTokens)) +
          " tokens" +
          pc.dim(" · ") +
          pc.bold(`#${rank.position}`) +
          pc.dim(`/${rank.totalUsers}`),
      );
    }
  }

  log("");
  log(pc.dim("view your leaderboard: ") + pc.cyan(cfg.apiUrl));
}

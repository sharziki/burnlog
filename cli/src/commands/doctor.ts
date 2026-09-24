import { BURNLOG_HOOK_RE } from "./install.js";
import pc from "picocolors";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, configPath } from "../config.js";
import { scanAll, totalTokens } from "../adapters/index.js";
import { readSink } from "../sink.js";
import { formatTokens } from "../format.js";

/**
 * `burnlog doctor` — find the things that quietly make your numbers wrong.
 *
 * Deliberately reports rather than repairs. The main risk in a
 * multiple-source tracker is *double counting*, and the honest response to a
 * suspected duplicate is to show the user and let them decide — silently
 * dropping events would trade an inflated number for a missing one, which is
 * worse because nobody notices.
 */

type Check = { level: "ok" | "warn" | "bad"; title: string; detail: string };

const MARK = { ok: pc.green("✓"), warn: pc.yellow("!"), bad: pc.red("✗") };

export async function doctor(_args: string[] = []): Promise<void> {
  const checks: Check[] = [];
  const cfg = loadConfig();

  // ---- account ----
  if (!cfg.apiKey) {
    checks.push({
      level: "bad",
      title: "not signed in",
      detail: "run `burnlog login` — nothing syncs without a key",
    });
  } else {
    checks.push({ level: "ok", title: "signed in", detail: configPath() });
  }

  // A stale apiUrl is the classic silent failure: syncs "succeed" against
  // somewhere that isn't production.
  if (/localhost|127\.0\.0\.1/.test(cfg.apiUrl)) {
    checks.push({
      level: "bad",
      title: "api url points at localhost",
      detail: `${cfg.apiUrl} — your burn is going to a dev server. Fix ${configPath()}`,
    });
  } else {
    checks.push({ level: "ok", title: "api url", detail: cfg.apiUrl });
  }

  // ---- sources ----
  const results = await scanAll();
  const live = results.filter((r) => r.events.length > 0);
  const total = results.reduce((s, r) => s + r.events.reduce((t, e) => t + totalTokens(e), 0), 0);

  checks.push({
    level: live.length ? "ok" : "warn",
    title: `${live.length} source${live.length === 1 ? "" : "s"} producing data`,
    detail: live.length
      ? live.map((r) => `${r.source} ${formatTokens(r.events.reduce((t, e) => t + totalTokens(e), 0))}`).join(" · ")
      : "nothing found — run an agent, or `burnlog wrap -- <cmd>`",
  });

  // ---- double counting ----
  // The proxy tags everything `proxy`. If a self-logging agent also reports
  // for the same period, the same calls may be counted twice.
  const sink = readSink();
  const proxyEvents = sink.events.filter((e) => e.source === "proxy");
  const selfLogging = live.filter((r) => ["claude-code", "codex", "hermes"].includes(r.source));

  if (proxyEvents.length > 0 && selfLogging.length > 0) {
    const overlap = overlappingWindow(proxyEvents, selfLogging);
    if (overlap) {
      checks.push({
        level: "warn",
        title: "possible double counting",
        detail:
          `${proxyEvents.length} wrap/proxy events overlap in time with ${overlap.source}. ` +
          `If you ran \`burnlog wrap\` around ${overlap.source}, those calls are counted twice — ` +
          `once at the wire, once from its log. Only wrap tools that keep no usage log.`,
      });
    } else {
      checks.push({
        level: "ok",
        title: "no wrap/log overlap detected",
        detail: "proxy events don't share a time window with self-logging agents",
      });
    }
  } else {
    checks.push({
      level: "ok",
      title: "no double-count risk",
      detail: proxyEvents.length
        ? "proxy events only — nothing else reports the same calls"
        : "no proxy events; each source reports its own calls",
    });
  }

  // Within a source, the server's (user, source, requestId) unique index makes
  // re-syncing idempotent. Surface it so people stop worrying about it.
  checks.push({
    level: "ok",
    title: "re-syncing is safe",
    detail: "events carry stable ids; the server drops duplicates on (user, source, id)",
  });

  // ---- automation ----
  const hook = claudeHookInstalled();
  checks.push({
    level: hook ? "ok" : "warn",
    title: hook ? "auto-sync installed" : "auto-sync not installed",
    detail: hook
      ? "Claude Code SessionEnd hook will sync for you"
      : "run `burnlog install` so you never have to run sync by hand",
  });

  // ---- render ----
  console.log();
  console.log("  " + pc.bold("burnlog doctor"));
  console.log();
  for (const c of checks) {
    console.log(`  ${MARK[c.level]} ${pc.bold(c.title)}`);
    console.log(`      ${pc.dim(c.detail)}`);
  }

  console.log();
  console.log(
    "  " + pc.dim("local total ") + pc.yellow(formatTokens(total)) + pc.dim(" across all sources"),
  );
  const bad = checks.filter((c) => c.level === "bad").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  console.log(
    "  " +
      (bad
        ? pc.red(`${bad} problem${bad === 1 ? "" : "s"}`)
        : warn
          ? pc.yellow(`${warn} warning${warn === 1 ? "" : "s"}`)
          : pc.green("all clear")),
  );
  console.log();
}

/**
 * Do proxy events share a day with a self-logging agent's events?
 * Day granularity deliberately: the question is "did you wrap this tool",
 * which is a session-shaped thing, not a per-second one.
 */
function overlappingWindow(
  proxyEvents: { timestamp: string }[],
  selfLogging: { source: string; events: { timestamp: string }[] }[],
): { source: string } | null {
  const proxyDays = new Set(proxyEvents.map((e) => e.timestamp.slice(0, 10)));
  for (const r of selfLogging) {
    for (const e of r.events) {
      if (proxyDays.has(e.timestamp.slice(0, 10))) return { source: r.source };
    }
  }
  return null;
}

function claudeHookInstalled(): boolean {
  const path = join(homedir(), ".claude", "settings.json");
  if (!existsSync(path)) return false;
  try {
    return BURNLOG_HOOK_RE.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

import pc from "picocolors";
import { existsSync, statSync } from "fs";
import { delimiter, join, sep } from "path";
import { homedir, hostname } from "os";
import { loadConfig } from "../config.js";
import { fetchRank, redeemConnectCode } from "../api.js";
import { formatTokens } from "../format.js";
import { browserLogin, saveApiKey } from "./login.js";
import { runSync, type SyncResult } from "./sync.js";
import { installHook, HOOK_COMMAND, NPX_HOOK_COMMAND } from "./install.js";
import { installSchedule } from "./schedule.js";

/**
 * `burnlog connect <code>` — the one command a coding agent runs.
 *
 * A user copies a prompt from burnlog.net into any agent; the agent runs
 * `npx -y @sxnalabs/burnlog@latest connect <code>`. No TTY, no prompts: link
 * the machine, upload every source's full history, turn on auto-sync, and
 * print a few lines the agent can relay verbatim. Counts only, as always.
 */

const CODE_RE = /^blc_[0-9a-f]{40}$/;
const NPX = "npx -y @sxnalabs/burnlog";

const ok = (msg: string) => console.log(pc.green("✓") + " " + msg);
const warn = (msg: string) => console.log(pc.yellow("!") + " " + msg);
function fail(msg: string): void {
  console.error(pc.red("✗") + " " + msg);
  process.exitCode = 1;
}

/** Short, hostname-ish label so the user can tell their machines apart. */
function machineLabel(): string {
  return hostname().replace(/\.local$/, "").replace(/[^\w.-]+/g, "-").slice(0, 40);
}

/**
 * Is there a real, persistent `burnlog` on PATH? Under npx the package's own
 * bin dir (…/_npx/<hash>/node_modules/.bin) is on PATH too, but it's a cache
 * that a hook firing next week can't rely on — so it doesn't count.
 */
function burnlogOnPath(): boolean {
  const names = process.platform === "win32" ? ["burnlog.cmd", "burnlog.exe", "burnlog"] : ["burnlog"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || dir.includes(`${sep}_npx${sep}`)) continue;
    for (const n of names) {
      try {
        if (statSync(join(dir, n)).isFile()) return true;
      } catch {
        // not here
      }
    }
  }
  return false;
}

function list(names: string[]): string {
  return names.join(", ");
}

export async function connect(args: string[]): Promise<void> {
  const code = args.find((a) => !a.startsWith("-"))?.trim();
  let cfg = loadConfig();
  const fresh = `copy a fresh prompt from ${cfg.apiUrl}`;
  let username: string | undefined;

  // 1 — link this machine.
  if (code) {
    if (!CODE_RE.test(code)) {
      fail(`that doesn't look like a burnlog setup code (expected blc_ + 40 hex characters) — ${fresh}`);
      return;
    }
    let r;
    try {
      r = await redeemConnectCode(cfg.apiUrl, code, machineLabel());
    } catch (err) {
      fail(`couldn't reach ${cfg.apiUrl}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!r.ok) {
      if (r.error === "expired_code") fail(`that setup code has expired — ${fresh}`);
      else if (r.error === "invalid_code") fail(`that setup code isn't valid (codes work once) — ${fresh}`);
      else if (r.error === "rate_limited") fail("too many attempts — wait a minute, then run the same command again");
      else fail(`couldn't redeem the setup code (${r.status}${r.detail ? `: ${r.detail}` : ""})`);
      return;
    }
    saveApiKey(r.key);
    username = r.username;
  } else {
    // No code: the interactive browser flow. Fine for a human at a terminal.
    try {
      await browserLogin({ hints: false });
    } catch (err) {
      fail(`login failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  }
  cfg = loadConfig();
  if (!cfg.apiKey) {
    fail("no api key saved — run `burnlog login` and try again");
    return;
  }
  if (!username) username = (await fetchRank(cfg.apiUrl, cfg.apiKey))?.username;
  ok(username ? `connected as @${username}` : "connected");

  // 3 (decided before printing 2, so the empty-history line can be honest
  // about what happens next) — auto-sync. A 30-minute schedule covers every
  // agent; Claude Code also gets a session-end hook so its numbers land at once.
  const schedule = installSchedule();
  let hook: "on" | "no-claude" | { error: string };
  if (existsSync(join(homedir(), ".claude"))) {
    try {
      installHook({
        command: burnlogOnPath() ? HOOK_COMMAND : NPX_HOOK_COMMAND,
      });
      hook = "on";
    } catch (err) {
      hook = { error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    hook = "no-claude";
  }

  // 2 — full history, every source; marks them backfilled so later syncs are
  // incremental.
  let result: SyncResult;
  try {
    result = await runSync({ full: true });
  } catch (err) {
    fail(
      `upload failed: ${err instanceof Error ? err.message : String(err)} — your machine is linked; retry with \`${NPX} sync --full\``,
    );
    return;
  }
  const found = result.sources.filter((s) => s.events > 0);
  const events = found.reduce((s, r) => s + r.events, 0);
  if (!found.length) {
    ok(
      "no agent usage found yet — " +
        (hook === "on" || schedule.status === "installed"
          ? "it will sync after your next session"
          : `run \`${NPX} sync\` after your next session`),
    );
  } else {
    ok(
      `synced ${events.toLocaleString("en-US")} event${events === 1 ? "" : "s"} from ${list(found.map((s) => s.source))} (${formatTokens(result.total)} tokens)`,
    );
  }

  const parts = [
    ...(schedule.status === "installed" ? ["every 30 min"] : []),
    ...(hook === "on" ? ["when a Claude Code session ends"] : []),
  ];
  if (parts.length) ok(`auto-sync on (${parts.join(", ")})`);
  else
    warn(
      `auto-sync not installed${schedule.status === "unavailable" ? `: ${schedule.reason}` : ""} — run \`${NPX} sync\` to update`,
    );
  if (typeof hook === "object") warn(`Claude Code hook not installed: ${hook.error}`);

  // 4 — where to look.
  const rank = await fetchRank(cfg.apiUrl, cfg.apiKey);
  const name = rank?.username ?? username;
  const profile = name ? `${cfg.apiUrl}/u/${name}` : cfg.apiUrl;
  console.log("→ " + (rank ? `#${rank.position} of ${rank.totalUsers} · ` : "") + pc.cyan(profile));
}

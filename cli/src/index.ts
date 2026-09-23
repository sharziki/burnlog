#!/usr/bin/env node
import pc from "picocolors";
import { readFileSync } from "fs";
import { join } from "path";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { scan } from "./commands/scan.js";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";
import { install, uninstall } from "./commands/install.js";
import { daemon } from "./commands/daemon.js";
import { budget } from "./commands/budget.js";
import { report } from "./commands/report.js";
import { setup } from "./commands/setup.js";
import { wrap } from "./commands/wrap.js";
import { challenge } from "./commands/challenge.js";
import { log } from "./commands/log.js";
import { me } from "./commands/me.js";
import { doctor } from "./commands/doctor.js";

function readVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `${pc.bold("burnlog")} ${pc.dim("· track your AI token burn")}

${pc.bold("usage")}
  burnlog                     ${pc.dim("scan, sign in, sync, done")}
  burnlog <command> [args]

${pc.bold("getting on the board")}
  ${pc.cyan("setup")}              the one-command flow (same as bare ${pc.bold("burnlog")})
  ${pc.cyan("login")}  [api-key]   sign in with GitHub in the browser; pass a key for CI (alias: ${pc.cyan("auth")})
  ${pc.cyan("logout")}             clear your api key

${pc.bold("counting tokens")}
  ${pc.cyan("scan")}               parse logs locally, show totals (dry run)
  ${pc.cyan("sync")}    [--full]   upload once, now — incremental; --full re-reads all history
  ${pc.cyan("wrap")}    -- <cmd>   count any command's LLM calls (any provider)
  ${pc.cyan("log")}     <tokens>   record usage by hand (dashboards, batch jobs)
  ${pc.cyan("me")}      [--days n] your burn over time (default 180 days)
  ${pc.cyan("install")}            set up auto-sync so you never run ${pc.bold("sync")} by hand again
  ${pc.cyan("uninstall")}          remove auto-sync
  ${pc.cyan("daemon")}             keep syncing every 30s while it runs (alternative to install)
  ${pc.cyan("doctor")}             check for double counting, stale config, missing auto-sync

${pc.bold("competing")}
  ${pc.cyan("challenge")}          list / ${pc.bold("new")} / ${pc.bold("join <code>")}
  ${pc.cyan("status")}             show config + leaderboard rank

${pc.bold("teams")}
  ${pc.cyan("budget")}             show team budgets (CI: --club <slug> --fail-on-over)
  ${pc.cyan("report")}             export team CSV usage (--club <slug> --out report.csv)

${pc.bold("env")}
  BURNLOG_API_URL        override api url (default https://burnlog.net)
  BURNLOG_API_KEY        api key for CI/non-interactive use
  BURNLOG_CLAUDE_DIR     override ~/.claude/projects
  BURNLOG_CODEX_DIR      override ~/.codex/sessions
  BURNLOG_EVENTS_DIR     override ~/.burnlog/events (the open sink)
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "login":
    case "auth":
      await login(rest);
      break;
    case "logout":
      logout(rest);
      break;
    case "scan":
      await scan(rest);
      break;
    case "sync":
      await sync(rest);
      break;
    case "status":
      await status(rest);
      break;
    case "budget":
      await budget(rest);
      break;
    case "report":
      await report(rest);
      break;
    case "install":
      install(rest);
      break;
    case "uninstall":
      uninstall(rest);
      break;
    case "daemon":
      await daemon(rest);
      break;
    case "setup":
    case "init":
      await setup(rest);
      break;
    case "wrap":
      await wrap(rest);
      break;
    case "challenge":
    case "challenges":
      await challenge(rest);
      break;
    case "log":
      log(rest);
      break;
    case "doctor":
    case "check":
      await doctor(rest);
      break;
    case "me":
      // `burnlog sync me` reads naturally, so accept it as an alias.
      await me(rest);
      break;
    // Bare `burnlog` runs the whole onboarding rather than printing help —
    // the first command should do something useful, not explain itself.
    case undefined:
      await setup([]);
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    case "--version":
    case "-v":
      console.log(readVersion());
      break;
    default:
      console.error(pc.red(`unknown command: ${cmd}`));
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(pc.red("error: ") + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

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
  burnlog <command> [args]

${pc.bold("commands")}
  ${pc.cyan("login")}  [api-key]   sign in with GitHub in the browser; pass a key for CI (alias: ${pc.cyan("auth")})
  ${pc.cyan("logout")}             clear your api key
  ${pc.cyan("scan")}               parse logs locally, show totals (dry run)
  ${pc.cyan("sync")}    [--quiet]  upload new burn events to the leaderboard
  ${pc.cyan("install")}            install a Claude Code hook (auto-sync on session end)
  ${pc.cyan("uninstall")}          remove the Claude Code hook
  ${pc.cyan("daemon")}             run a background watcher that syncs every 30s
  ${pc.cyan("status")}             show config + leaderboard rank
  ${pc.cyan("budget")}             show team budgets (CI: --club <slug> --fail-on-over)
  ${pc.cyan("report")}             export team CSV usage (--club <slug> --out report.csv)
  ${pc.cyan("help")}               show this

${pc.bold("env")}
  BURNLOG_API_URL        override api url (default https://burnlog.sxna.dev)
  BURNLOG_API_KEY        api key for CI/non-interactive use
  BURNLOG_CLAUDE_DIR     override ~/.claude/projects
  BURNLOG_CODEX_DIR      override ~/.codex/sessions
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
      scan(rest);
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
    case "help":
    case "--help":
    case "-h":
    case undefined:
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

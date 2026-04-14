#!/usr/bin/env node
import pc from "picocolors";
import { login } from "./commands/login.js";
import { scan } from "./commands/scan.js";
import { sync } from "./commands/sync.js";
import { status } from "./commands/status.js";

const HELP = `${pc.bold("burnlog")} ${pc.dim("· track your AI token burn")}

${pc.bold("usage")}
  burnlog <command> [args]

${pc.bold("commands")}
  ${pc.cyan("login")}  <api-key>   save your api key
  ${pc.cyan("scan")}               parse ~/.claude logs, show local totals (dry run)
  ${pc.cyan("sync")}               upload new burn events to the web leaderboard
  ${pc.cyan("status")}             show current config
  ${pc.cyan("help")}               show this

${pc.bold("env")}
  BURNLOG_API_URL    override api url (default http://localhost:3000)
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "login":
      login(rest);
      break;
    case "scan":
      scan(rest);
      break;
    case "sync":
      await sync(rest);
      break;
    case "status":
      status(rest);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
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

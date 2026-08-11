import pc from "picocolors";
import { createInterface } from "readline";
import { loadConfig } from "../config.js";
import { scanAll, totalTokens } from "../adapters/index.js";
import { formatTokens } from "../format.js";
import { fetchRank } from "../api.js";
import { login } from "./login.js";
import { sync } from "./sync.js";
import { install } from "./install.js";

/**
 * `burnlog` with no arguments.
 *
 * The whole onboarding is one command: show what we found before asking for
 * anything, sign in, upload, and wire up auto-sync. The order matters — a
 * new user sees their own numbers before they're asked to create an account.
 */

function interactive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && !process.env.CI;
}

async function confirm(question: string, fallback = true): Promise<boolean> {
  if (!interactive()) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question} ${pc.dim(fallback ? "[Y/n]" : "[y/N]")} `, (a) => {
      rl.close();
      resolve(a.trim().toLowerCase());
    });
  });
  if (!answer) return fallback;
  return answer.startsWith("y");
}

function banner(): void {
  console.log();
  console.log(
    "  " + pc.yellow("▲") + "  " + pc.bold("burnlog") + pc.dim("  ·  track the burn"),
  );
  console.log();
}

/** Step 1 — prove there's something to track before asking for a signup. */
function survey(): { events: number; tokens: number; found: string[] } {
  const results = scanAll();
  const found: string[] = [];
  let events = 0;
  let tokens = 0;

  console.log(pc.dim("  scanning for agents…"));
  console.log();
  for (const r of results) {
    const t = r.events.reduce((s, e) => s + totalTokens(e), 0);
    if (r.events.length > 0) {
      found.push(r.source);
      events += r.events.length;
      tokens += t;
      console.log(
        "  " +
          pc.green("●") +
          "  " +
          pc.bold(r.source.padEnd(14)) +
          pc.yellow(formatTokens(t).padStart(8)) +
          pc.dim(`  ${r.events.length} calls`),
      );
    } else {
      console.log("  " + pc.dim("○") + "  " + pc.dim(r.source.padEnd(14)) + pc.dim(r.note ?? "no data"));
    }
  }
  console.log();
  return { events, tokens, found };
}

export async function setup(_args: string[] = []): Promise<void> {
  banner();
  const { events, tokens, found } = survey();

  if (events === 0) {
    console.log(pc.yellow("  no burn history found yet."));
    console.log();
    console.log("  burnlog reads local agent logs. If you use Claude Code or Codex,");
    console.log("  run a session first and try again. For anything else:");
    console.log();
    console.log("    " + pc.bold("burnlog wrap -- <your command>") + pc.dim("   count any LLM call live"));
    console.log("    " + pc.bold("burnlog wrap --list") + pc.dim("              see supported providers"));
    console.log();
    return;
  }

  console.log(
    "  found " +
      pc.yellow(formatTokens(tokens)) +
      pc.dim(" tokens across ") +
      pc.cyan(String(found.length)) +
      pc.dim(found.length === 1 ? " source" : " sources"),
  );
  console.log();

  // Step 2 — sign in, unless a key is already stored.
  let cfg = loadConfig();
  if (!cfg.apiKey) {
    // Never launch a browser flow from CI or a pipe — it would block for the
    // full login timeout with nobody there to complete it.
    if (!interactive()) {
      console.log(pc.yellow("  not signed in, and this isn't an interactive terminal."));
      console.log();
      console.log("  set " + pc.bold("BURNLOG_API_KEY") + pc.dim(" (grab one at ") + pc.cyan(`${cfg.apiUrl}/settings`) + pc.dim(")"));
      console.log("  or run " + pc.bold("burnlog login") + pc.dim(" from a terminal."));
      console.log();
      return;
    }
    if (!(await confirm("  Put these on the leaderboard?"))) {
      console.log();
      console.log(pc.dim("  no problem — run ") + pc.bold("burnlog") + pc.dim(" again whenever."));
      console.log(pc.dim("  nothing has left this machine."));
      console.log();
      return;
    }
    await login([]);
    cfg = loadConfig();
    if (!cfg.apiKey) return;
  } else {
    console.log(pc.dim("  already signed in · ") + pc.dim(cfg.apiUrl));
    console.log();
  }

  // Step 3 — upload.
  await sync([]);

  // Step 4 — make it automatic, so this is the last time they think about it.
  console.log();
  if (found.includes("claude-code")) {
    if (await confirm("  Auto-sync when a Claude Code session ends?")) {
      install([]);
    } else {
      console.log(pc.dim("  skipped — run ") + pc.bold("burnlog install") + pc.dim(" later."));
    }
  }

  // Step 5 — hand them the things worth sharing.
  const rank = await fetchRank(cfg.apiUrl, cfg.apiKey);
  if (rank) {
    const profile = `${cfg.apiUrl}/u/${rank.username}`;
    console.log();
    console.log("  " + pc.bold("you're live"));
    console.log("    profile  " + pc.cyan(profile));
    console.log("    badge    " + pc.dim(`![burnlog](${cfg.apiUrl}/badge/${rank.username})`));
    console.log();
    console.log(pc.dim("  next: ") + pc.bold("burnlog challenge") + pc.dim("  start a sprint against a friend"));
  }
  console.log();
}

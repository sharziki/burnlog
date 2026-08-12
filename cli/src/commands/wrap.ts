import { spawn } from "child_process";
import pc from "picocolors";
import { startProxy } from "../proxy.js";
import { PROVIDERS, proxyEnv } from "../providers.js";
import { appendEvent } from "../sink.js";
import { totalTokens, type BurnEvent } from "../adapters/index.js";
import { formatTokens } from "../format.js";

/**
 * `burnlog wrap -- <command>`
 *
 * Runs any command with every known LLM base-URL env var pointed at a local
 * counting proxy. Works for tools that never write a usage log — Cursor CLI,
 * Gemini CLI, aider, your own scripts — because it counts at the wire, not
 * on disk.
 */

const USAGE = `${pc.bold("burnlog wrap")} ${pc.dim("· count tokens for any command")}

  burnlog wrap -- <command> [args...]

${pc.bold("examples")}
  burnlog wrap -- aider
  burnlog wrap -- python my_agent.py
  burnlog wrap -- cursor-agent
  burnlog wrap --only anthropic,openai -- npm run agent

${pc.bold("flags")}
  --only <ids>   restrict to these providers (comma separated)
  --list         list supported providers and the env vars they set
  --quiet        don't print the per-call burn line
`;

/**
 * Tools burnlog already reads off disk. Wrapping these double counts.
 * Matched on the command basename, so `/usr/local/bin/claude` still trips it.
 */
const SELF_LOGGING: { match: RegExp; tool: string; path: string }[] = [
  { match: /^claude$/, tool: "Claude Code", path: "~/.claude/projects" },
  { match: /^codex$/, tool: "Codex", path: "~/.codex/sessions" },
  { match: /^hermes$/, tool: "Hermes", path: "~/.hermes/state.db" },
];

function detectSelfLogging(command: string): { tool: string; path: string } | null {
  const base = (command.split("/").pop() ?? command).toLowerCase();
  return SELF_LOGGING.find((s) => s.match.test(base)) ?? null;
}

export async function wrap(args: string[]): Promise<void> {
  if (args.includes("--list")) {
    console.log();
    console.log(pc.bold("providers burnlog wrap can count"));
    console.log();
    for (const p of PROVIDERS) {
      console.log(
        "  " +
          pc.cyan(p.id.padEnd(12)) +
          pc.dim(p.label.padEnd(18)) +
          pc.dim(p.envVars.join(", ")),
      );
    }
    console.log();
    console.log(
      pc.dim("anything speaking an OpenAI-compatible API works via ") +
        pc.bold("OPENAI_BASE_URL") +
        pc.dim("."),
    );
    console.log();
    return;
  }

  const separator = args.indexOf("--");
  if (separator === -1 || separator === args.length - 1) {
    console.log(USAGE);
    process.exit(args.length ? 1 : 0);
  }

  const flags = args.slice(0, separator);
  const command = args.slice(separator + 1);
  const quiet = flags.includes("--quiet") || flags.includes("-q");

  const onlyFlag = flags.indexOf("--only");
  const only =
    onlyFlag !== -1 && flags[onlyFlag + 1]
      ? flags[onlyFlag + 1].split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  if (only) {
    const unknown = only.filter((id) => !PROVIDERS.some((p) => p.id === id));
    if (unknown.length) {
      console.error(pc.red(`unknown provider(s): ${unknown.join(", ")}`));
      console.error(pc.dim("run `burnlog wrap --list` to see the supported set"));
      process.exit(1);
    }
  }

  // Wrapping a tool that already writes its own usage log means the same call
  // gets counted twice: once at the wire by this proxy, once off disk by that
  // tool's adapter. There is no way to reconcile them afterwards — the proxy
  // never sees the provider's request id — so warn before the burn happens
  // rather than silently inflating someone's numbers.
  const selfLogging = detectSelfLogging(command[0]);
  if (selfLogging) {
    console.error(
      pc.yellow("[burnlog] warning: ") +
        pc.bold(selfLogging.tool) +
        pc.yellow(" writes its own usage log, which burnlog already reads.\n") +
        pc.dim(`           Wrapping it double counts every call — once here, once from ${selfLogging.path}.\n`) +
        pc.dim("           Just run it normally; `burnlog sync` picks it up. Use wrap for tools that keep no log.\n"),
    );
  }

  let captured = 0;
  let tokens = 0;

  const proxy = await startProxy({
    onEvent(event: BurnEvent) {
      // Persist first — a wrapped command must keep counting with no network
      // and no API key. `burnlog sync` uploads later.
      try {
        appendEvent(event);
      } catch {
        // A failed write must never take down the user's command.
      }
      captured++;
      tokens += totalTokens(event);
      if (!quiet) {
        process.stderr.write(
          pc.dim(`[burnlog] ${event.model} `) +
            pc.yellow(formatTokens(totalTokens(event))) +
            pc.dim(" tokens\n"),
        );
      }
    },
    onError(message) {
      if (!quiet) process.stderr.write(pc.red(`[burnlog] ${message}\n`));
    },
  });

  const env = { ...process.env, ...proxyEnv(proxy.baseUrl, only) };
  if (!quiet) {
    console.error(
      pc.dim("[burnlog] counting on ") +
        pc.cyan(proxy.baseUrl) +
        pc.dim(` · ${only ? only.join(", ") : `${PROVIDERS.length} providers`}\n`),
    );
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: "inherit",
    env,
  });

  // Relay signals so ^C reaches the wrapped process, not just us.
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);

  const code = await new Promise<number>((resolve) => {
    child.on("error", (err) => {
      console.error(pc.red(`could not run ${command[0]}: ${err.message}`));
      resolve(127);
    });
    child.on("close", (exitCode, signal) => {
      resolve(signal ? 128 : (exitCode ?? 0));
    });
  });

  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
  await proxy.close();

  if (!quiet) {
    console.error(
      "\n" +
        pc.dim("[burnlog] ") +
        pc.cyan(String(captured)) +
        pc.dim(" calls · ") +
        pc.yellow(formatTokens(tokens)) +
        pc.dim(" tokens · run ") +
        pc.bold("burnlog sync") +
        pc.dim(" to upload"),
    );
  }

  process.exit(code);
}

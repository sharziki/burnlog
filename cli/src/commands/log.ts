import pc from "picocolors";
import { randomUUID } from "crypto";
import { appendEvent } from "../sink.js";
import { providerFromModel } from "../adapters/index.js";

/**
 * `burnlog log <tokens>` — report usage burnlog can't see for itself.
 * Escape hatch for provider dashboards, batch jobs, and languages we don't
 * ship an SDK for. Writes to the same sink `burnlog wrap` uses.
 */

const USAGE = `${pc.bold("burnlog log")} ${pc.dim("· record tokens by hand")}

  burnlog log <total-tokens> [flags]

${pc.bold("flags")}
  --model <name>     model name (default: unknown)
  --in <n>           input tokens (overrides the split)
  --out <n>          output tokens
  --source <tag>     source tag, [a-z0-9-] (default: manual)
  --at <iso>         timestamp (default: now)

${pc.bold("examples")}
  burnlog log 42000 --model claude-opus-4-6
  burnlog log 0 --in 30000 --out 12000 --model gpt-5 --source batch-job
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

export function log(args: string[]): void {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(args.length ? 0 : 1);
  }

  const model = flag(args, "model") ?? "unknown";
  const source = flag(args, "source") ?? "manual";
  if (!/^[a-z0-9-]{1,32}$/.test(source)) {
    console.error(pc.red("--source must match [a-z0-9-] and be 1-32 chars"));
    process.exit(1);
  }

  const explicitIn = flag(args, "in");
  const explicitOut = flag(args, "out");
  const positional = Number(args.find((a) => !a.startsWith("--") && !Number.isNaN(Number(a))) ?? 0);

  let inputTokens: number;
  let outputTokens: number;
  if (explicitIn !== undefined || explicitOut !== undefined) {
    inputTokens = Math.max(0, Math.floor(Number(explicitIn ?? 0)));
    outputTokens = Math.max(0, Math.floor(Number(explicitOut ?? 0)));
  } else {
    // Only a total was given. Attribute it all to input rather than inventing
    // a split — the leaderboard counts the sum either way.
    inputTokens = Math.max(0, Math.floor(positional));
    outputTokens = 0;
  }

  const total = inputTokens + outputTokens;
  if (total <= 0) {
    console.error(pc.red("nothing to log — pass a positive token count"));
    process.exit(1);
  }

  const at = flag(args, "at");
  const timestamp =
    at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();

  appendEvent({
    requestId: randomUUID(),
    source,
    model,
    provider: providerFromModel(model),
    inputTokens,
    outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    timestamp,
  });

  console.log(
    pc.green("✓") +
      ` logged ${pc.yellow(total.toLocaleString())} tokens` +
      pc.dim(` · ${model} · ${source}`),
  );
  console.log(pc.dim("  run ") + pc.bold("burnlog sync") + pc.dim(" to upload"));
}

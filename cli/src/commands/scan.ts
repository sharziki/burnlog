import pc from "picocolors";
import { scanAll, totalTokens } from "../adapters/index.js";
import { formatTokens } from "../format.js";

export async function scan(args: string[]): Promise<void> {
  const results = await scanAll();
  if (args.includes("--json")) {
    // Aggregates only: safe to share without exposing paths, session IDs,
    // request IDs, prompts, or raw log records.
    console.log(JSON.stringify(results.map((r) => ({
      source: r.source,
      events: r.events.length,
      scannedFiles: r.scannedFiles,
      inputTokens: r.events.reduce((n, e) => n + e.inputTokens, 0),
      outputTokens: r.events.reduce((n, e) => n + e.outputTokens, 0),
      cacheCreationTokens: r.events.reduce((n, e) => n + e.cacheCreationTokens, 0),
      cacheReadTokens: r.events.reduce((n, e) => n + e.cacheReadTokens, 0),
      rankedTokens: r.events.reduce((n, e) => n + totalTokens(e), 0),
      ...(r.note ? { note: r.note } : {}),
    })), null, 2));
    return;
  }
  const allEvents = results.flatMap((r) => r.events);
  const grand = allEvents.reduce((s, e) => s + totalTokens(e), 0);

  console.log();
  console.log(pc.bold("burnlog") + pc.dim(" · local scan"));
  console.log();

  for (const r of results) {
    const tokens = r.events.reduce((s, e) => s + totalTokens(e), 0);
    const badge =
      r.events.length > 0
        ? pc.green("●")
        : r.note?.startsWith("detected")
        ? pc.yellow("◐")
        : pc.dim("○");
    const label = r.source.padEnd(14);
    if (r.events.length > 0) {
      console.log(
        "  " +
          badge +
          "  " +
          pc.bold(label) +
          pc.dim(`${r.events.length} events · ${r.scannedFiles} files · `) +
          pc.yellow(formatTokens(tokens)),
      );
    } else {
      console.log("  " + badge + "  " + pc.dim(label) + pc.dim(r.note ?? "no data"));
    }
  }

  console.log();
  console.log("  " + pc.dim("total tokens   ") + pc.yellow(formatTokens(grand)));
  console.log("  " + pc.dim("total events   ") + pc.cyan(allEvents.length.toString()));

  // Model breakdown.
  const byModel = new Map<string, number>();
  for (const e of allEvents) byModel.set(e.model, (byModel.get(e.model) ?? 0) + totalTokens(e));
  const top = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log();
    console.log(pc.bold("top models"));
    for (const [model, tokens] of top) {
      console.log("  " + model.padEnd(32) + pc.yellow(formatTokens(tokens)));
    }
  }

  console.log();
  console.log(pc.dim("run ") + pc.bold("burnlog sync") + pc.dim(" to upload"));
}

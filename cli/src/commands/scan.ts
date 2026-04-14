import pc from "picocolors";
import { loadConfig } from "../config.js";
import { parseClaudeProjects, totalTokens } from "../parser.js";
import { formatTokens } from "../format.js";

export function scan(_args: string[]): void {
  const cfg = loadConfig();
  console.log(pc.dim("scanning " + cfg.claudeProjectsDir));
  const result = parseClaudeProjects(cfg.claudeProjectsDir!);

  const total = result.events.reduce((s, e) => s + totalTokens(e), 0);
  const byProject = new Map<string, number>();
  for (const e of result.events) {
    const label = e.project.split("/").filter(Boolean).pop() ?? e.project;
    byProject.set(label, (byProject.get(label) ?? 0) + totalTokens(e));
  }
  const top = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  console.log();
  console.log(pc.bold("burnlog ") + pc.dim("· local scan"));
  console.log();
  console.log("  files scanned     " + pc.cyan(result.scannedFiles.toString()));
  console.log("  lines read        " + pc.cyan(result.totalLines.toString()));
  console.log("  unique requests   " + pc.cyan(result.dedupedRequests.toString()));
  console.log("  total tokens      " + pc.yellow(formatTokens(total)));
  console.log();
  if (top.length) {
    console.log(pc.bold("top projects"));
    for (const [name, tokens] of top) {
      console.log("  " + name.padEnd(40) + pc.yellow(formatTokens(tokens)));
    }
  }
  console.log();
  console.log(pc.dim("run ") + pc.bold("burnlog sync") + pc.dim(" to upload"));
}

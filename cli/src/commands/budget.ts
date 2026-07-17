import pc from "picocolors";
import { fetchClubs } from "../api.js";
import { loadConfig } from "../config.js";
import { formatTokens } from "../format.js";

function pct(tokens: number, budget: number): string {
  if (budget <= 0) return "-";
  return `${Math.round((tokens / budget) * 100)}%`;
}

function argValue(args: string[], name: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function budget(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const failOnWarning = args.includes("--fail-on-warning");
  const failOnOver = failOnWarning || args.includes("--fail-on-over");
  const clubFilter = argValue(args, "--club");
  const cfg = loadConfig();

  if (!cfg.apiKey) {
    throw new Error("missing api key. Run `burnlog login <key>` or set BURNLOG_API_KEY.");
  }

  const data = await fetchClubs(cfg.apiUrl, cfg.apiKey);
  const clubs = clubFilter
    ? (data.clubs ?? []).filter((c) => c.slug === clubFilter || c.id === clubFilter)
    : data.clubs ?? [];
  if (clubFilter && clubs.length === 0) {
    throw new Error(`no team matched --club ${clubFilter}`);
  }
  const worst = clubs.some((c) => c.budgetStatus === "over")
    ? "over"
    : clubs.some((c) => c.budgetStatus === "warning")
      ? "warning"
      : "ok";

  if (json) {
    console.log(JSON.stringify({ ok: true, worst, clubs }, null, 2));
  } else {
    console.log();
    console.log(pc.bold("burnlog") + pc.dim(" · team budgets"));
    console.log();
    if (clubs.length === 0) {
      console.log(pc.dim("  no teams joined"));
    }
    for (const c of clubs) {
      const color = c.budgetStatus === "over"
        ? pc.red
        : c.budgetStatus === "warning"
          ? pc.yellow
          : c.budgetStatus === "unset"
            ? pc.dim
            : pc.green;
      console.log(
        `  ${pc.bold(c.name)} ${pc.dim(`/${c.slug}`)}  ` +
          `${formatTokens(c.monthlyTokens)} / ${formatTokens(c.monthlyBudgetTokens)} ` +
          pc.dim(`(${pct(c.monthlyTokens, c.monthlyBudgetTokens)}) `) +
          color(c.budgetStatus),
      );
    }
    console.log();
  }

  if ((worst === "over" && failOnOver) || (worst === "warning" && failOnWarning)) {
    process.exitCode = 2;
  }
}

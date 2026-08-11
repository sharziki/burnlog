import pc from "picocolors";
import { loadConfig } from "../config.js";
import { formatTokens } from "../format.js";

/**
 * `burnlog challenge` — start or check a challenge without leaving the shell.
 * The point is the invite link: create one, paste it in a group chat, done.
 */

const TYPES = ["sprint", "efficiency", "provider", "streak", "cost-cap"] as const;

const USAGE = `${pc.bold("burnlog challenge")} ${pc.dim("· settle it with numbers")}

  burnlog challenge                       list your challenges
  burnlog challenge new [name]            start one (default: 7-day sprint)
  burnlog challenge join <code>           join by invite code

${pc.bold("flags for new")}
  --type <${TYPES.join("|")}>
  --days <n>            duration (must be valid for the type)
  --provider <id>       provider-lock target
  --target <n>          streak-race target in days
  --budget <tokens>     cost-cap ceiling
`;

type Standing = {
  username: string;
  score: number;
  tokens: number;
  qualified: boolean;
  place: number;
};

type ChallengeView = {
  name: string;
  typeLabel: string;
  unit: string;
  inviteCode: string;
  status: string;
  msRemaining: number;
  standings: Standing[];
  winnerUsername: string | null;
};

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Everything that isn't a flag or a flag's value. Without the second half,
 * `challenge new "Sprint" --type sprint --days 7` would name the challenge
 * "Sprint sprint 7".
 */
function positionalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      i++; // skip this flag's value
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

function requireKey(): { apiUrl: string; apiKey: string } {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(pc.red("no api key — run ") + pc.bold("burnlog login"));
    process.exit(1);
  }
  return { apiUrl: cfg.apiUrl, apiKey: cfg.apiKey };
}

function remaining(ms: number): string {
  if (ms <= 0) return "ended";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h left` : `${hours}h left`;
}

function printChallenge(c: ChallengeView, apiUrl: string): void {
  console.log();
  console.log(
    "  " +
      pc.bold(c.name) +
      pc.dim(`  ${c.typeLabel} · `) +
      (c.status === "ended" ? pc.dim("settled") : pc.green(remaining(c.msRemaining))),
  );
  console.log("  " + pc.cyan(`${apiUrl}/c/${c.inviteCode}`));
  console.log();
  for (const s of c.standings.slice(0, 10)) {
    const marker =
      c.status === "ended" && s.username === c.winnerUsername ? pc.yellow("★") : pc.dim(String(s.place));
    console.log(
      "  " +
        marker +
        "  " +
        pc.bold(`@${s.username}`.padEnd(20)) +
        (s.qualified
          ? pc.yellow(String(Math.round(s.score)).padStart(9))
          : pc.dim("     —   ")) +
        pc.dim(`  ${c.unit}`) +
        pc.dim(`   ${formatTokens(s.tokens)}`),
    );
  }
  console.log();
}

async function list(): Promise<void> {
  const { apiUrl, apiKey } = requireKey();
  const res = await fetch(`${apiUrl}/api/challenges`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = (await res.json()) as { ok: boolean; mine?: ChallengeView[]; open?: ChallengeView[] };
  if (!data.ok) {
    console.error(pc.red("could not load challenges"));
    process.exit(1);
  }
  if (!data.mine?.length) {
    console.log();
    console.log(pc.dim("  you're not in any challenges."));
    console.log("  " + pc.bold("burnlog challenge new") + pc.dim("   start a 7-day sprint"));
    console.log();
  }
  for (const c of data.mine ?? []) printChallenge(c, apiUrl);
  if (data.open?.length) {
    console.log(pc.dim("  open to join:"));
    for (const c of data.open.slice(0, 5)) {
      console.log(
        "    " + pc.bold(c.name.padEnd(28)) + pc.dim(`${apiUrl}/c/${c.inviteCode}`),
      );
    }
    console.log();
  }
}

async function create(args: string[]): Promise<void> {
  const { apiUrl, apiKey } = requireKey();
  const type = (flag(args, "type") ?? "sprint") as (typeof TYPES)[number];
  if (!TYPES.includes(type)) {
    console.error(pc.red(`unknown type "${type}" — one of ${TYPES.join(", ")}`));
    process.exit(1);
  }
  const name = positionalArgs(args).join(" ").trim();
  const days = Number(flag(args, "days") ?? (type === "streak" ? 14 : 7));

  const res = await fetch(`${apiUrl}/api/challenges`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      name: name || undefined,
      type,
      days,
      provider: flag(args, "provider"),
      targetStreak: flag(args, "target") ? Number(flag(args, "target")) : undefined,
      budgetTokens: flag(args, "budget") ? Number(flag(args, "budget")) : undefined,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    message?: string;
    challenge?: { name: string; inviteCode: string };
  };
  if (!data.ok || !data.challenge) {
    console.error(pc.red(data.message ?? "could not create the challenge"));
    process.exit(1);
  }

  console.log();
  console.log("  " + pc.green("✓") + " " + pc.bold(data.challenge.name));
  console.log();
  console.log("  share this:");
  console.log("  " + pc.cyan(`${apiUrl}/c/${data.challenge.inviteCode}`));
  console.log();
}

async function join(code: string | undefined): Promise<void> {
  if (!code) {
    console.error(pc.red("usage: burnlog challenge join <code>"));
    process.exit(1);
  }
  const { apiUrl, apiKey } = requireKey();
  // Accept a pasted URL as well as a bare code — people paste links.
  const clean = code.replace(/^.*\/c\//, "").replace(/[^a-z0-9]/gi, "");
  const res = await fetch(`${apiUrl}/api/challenges/${clean}/join`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = (await res.json()) as { ok: boolean; message?: string };
  if (!data.ok) {
    console.error(pc.red(data.message ?? "could not join"));
    process.exit(1);
  }
  console.log(pc.green("✓") + " joined · " + pc.cyan(`${apiUrl}/c/${clean}`));
}

export async function challenge(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case "list":
      await list();
      break;
    case "new":
    case "create":
      await create(rest);
      break;
    case "join":
      await join(rest[0]);
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      console.error(pc.red(`unknown subcommand: ${sub}`));
      console.log(USAGE);
      process.exit(1);
  }
}

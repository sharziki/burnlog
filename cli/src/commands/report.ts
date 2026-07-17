import { writeFileSync } from "fs";
import pc from "picocolors";
import { fetchClubReport, fetchClubs } from "../api.js";
import { loadConfig } from "../config.js";

function argValue(args: string[], name: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function report(args: string[]): Promise<void> {
  const clubFilter = argValue(args, "--club");
  const from = argValue(args, "--from");
  const to = argValue(args, "--to");
  const out = argValue(args, "--out");
  const cfg = loadConfig();

  if (!cfg.apiKey) {
    throw new Error("missing api key. Run `burnlog login <key>` or set BURNLOG_API_KEY.");
  }

  const clubs = (await fetchClubs(cfg.apiUrl, cfg.apiKey)).clubs ?? [];
  const club = clubFilter
    ? clubs.find((c) => c.slug === clubFilter || c.id === clubFilter)
    : clubs.length === 1
      ? clubs[0]
      : undefined;
  if (!club) {
    throw new Error(clubFilter ? `no team matched --club ${clubFilter}` : "missing --club <slug-or-id>");
  }

  const csv = await fetchClubReport(cfg.apiUrl, cfg.apiKey, club.id, { from, to });
  if (out) {
    writeFileSync(out, csv);
    console.log(pc.green("wrote ") + out);
  } else {
    process.stdout.write(csv);
  }
}

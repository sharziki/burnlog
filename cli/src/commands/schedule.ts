import { execFileSync, spawnSync } from "child_process";
import { dirname } from "path";

/**
 * A background sync every 30 minutes, for every agent.
 *
 * The Claude Code hook only fires for Claude Code; someone who lives in Codex,
 * Cursor or Gemini got no auto-sync at all. A schedule covers them all:
 * crontab on macOS and Linux, Task Scheduler on Windows. Nothing runs as root
 * and nothing is installed beyond the one entry, which `burnlog uninstall`
 * removes.
 */

const MARK = "# burnlog-sync";
const TASK = "burnlog-sync";

/** The command the schedule runs, with absolute paths — cron's PATH is nearly empty. */
export function scheduledCommand(): string {
  const nodeDir = dirname(process.execPath);
  const path = `PATH="${nodeDir}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"`;
  const bin = which("burnlog");
  const run = bin && !bin.includes("_npx") ? `"${bin}" sync --quiet` : `npx -y @sxnalabs/burnlog@latest sync --quiet`;
  return `${path} ${run}`;
}

/** Replace any previous burnlog line and append the current one. Pure, for tests. */
export function mergeCrontab(existing: string, command: string): string {
  const kept = existing
    .split("\n")
    .filter((l) => l.trim() && !l.includes(MARK));
  kept.push(`*/30 * * * * ${command} >/dev/null 2>&1 ${MARK}`);
  return kept.join("\n") + "\n";
}

export function stripCrontab(existing: string): string {
  const kept = existing.split("\n").filter((l) => l.trim() && !l.includes(MARK));
  return kept.length ? kept.join("\n") + "\n" : "";
}

function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [cmd] : ["-c", `command -v ${cmd}`], {
    encoding: "utf8",
  });
  const out = r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : "";
  return out || null;
}

function readCrontab(): string {
  const r = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  // "no crontab for user" exits non-zero; that's an empty table, not an error.
  return r.status === 0 ? r.stdout : "";
}

function writeCrontab(content: string): void {
  execFileSync("crontab", ["-"], { input: content, stdio: ["pipe", "ignore", "pipe"] });
}

export type ScheduleResult = { status: "installed" } | { status: "unavailable"; reason: string };

export function installSchedule(): ScheduleResult {
  // Tests (and anyone who wants hook-only syncing) opt out here.
  if (process.env.BURNLOG_NO_SCHEDULE) return { status: "unavailable", reason: "disabled by BURNLOG_NO_SCHEDULE" };
  try {
    if (process.platform === "win32") {
      const r = spawnSync(
        "schtasks",
        ["/Create", "/F", "/SC", "MINUTE", "/MO", "30", "/TN", TASK, "/TR", "cmd /c npx -y @sxnalabs/burnlog@latest sync --quiet"],
        { encoding: "utf8" },
      );
      return r.status === 0 ? { status: "installed" } : { status: "unavailable", reason: "Task Scheduler refused the task" };
    }
    if (!which("crontab")) return { status: "unavailable", reason: "no crontab on this machine" };
    writeCrontab(mergeCrontab(readCrontab(), scheduledCommand()));
    return { status: "installed" };
  } catch (err) {
    return { status: "unavailable", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** True if anything was removed. */
export function removeSchedule(): boolean {
  if (process.env.BURNLOG_NO_SCHEDULE) return false;
  try {
    if (process.platform === "win32") {
      return spawnSync("schtasks", ["/Delete", "/F", "/TN", TASK]).status === 0;
    }
    if (!which("crontab")) return false;
    const before = readCrontab();
    if (!before.includes(MARK)) return false;
    writeCrontab(stripCrontab(before));
    return true;
  } catch {
    return false;
  }
}

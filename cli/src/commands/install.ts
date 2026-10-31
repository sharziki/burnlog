import pc from "picocolors";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { delimiter, join, sep } from "path";
import { homedir } from "os";
import { installSchedule, removeSchedule } from "./schedule.js";

type ClaudeHook = { type: string; command: string };
type ClaudeHookGroup = { matcher?: string; hooks: ClaudeHook[] };
type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookGroup[]>;
  [k: string]: unknown;
};

/**
 * Recognises our hook in both spellings: `burnlog sync …` and the npx form
 * `@sxnalabs/burnlog@latest sync …`, which a plain substring check missed.
 */
export const BURNLOG_HOOK_RE = /burnlog(@[\w.-]+)? sync/;

/** Ignore npx's transient shim when choosing a persistent hook command. */
export function burnlogOnPath(): boolean {
  const names = process.platform === "win32" ? ["burnlog.cmd", "burnlog.exe", "burnlog"] : ["burnlog"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || dir.includes(`${sep}_npx${sep}`)) continue;
    for (const name of names) {
      try { if (statSync(join(dir, name)).isFile()) return true; } catch { /* absent */ }
    }
  }
  return false;
}

function settingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function loadSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as ClaudeSettings;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    throw new Error(
      `failed to parse ${path} — fix or rename it before installing the hook`,
    );
  }
}

function saveSettings(path: string, settings: ClaudeSettings): void {
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
}

function hasBurnlogHook(groups: ClaudeHookGroup[] | undefined): boolean {
  if (!groups) return false;
  return groups.some((g) =>
    (g.hooks ?? []).some((h) => BURNLOG_HOOK_RE.test(h.command ?? "")),
  );
}

/** The hook command that runs when `burnlog` is a real binary on PATH. */
export const HOOK_COMMAND = "burnlog sync --quiet --background || true";
/** The same, for machines where burnlog only ever arrived through npx. */
export const NPX_HOOK_COMMAND = "npx -y @sxnalabs/burnlog@latest sync --quiet --background || true";

/**
 * Add the auto-sync hook to ~/.claude/settings.json. Prints nothing; throws if
 * the settings file exists but can't be parsed.
 */
export function installHook(
  opts: { event?: "SessionEnd" | "Stop"; command?: string } = {},
): { status: "installed" | "updated" | "exists"; event: string; path: string } {
  const event = opts.event ?? "SessionEnd";
  const path = settingsPath();
  const settings = loadSettings(path);

  settings.hooks ??= {};
  settings.hooks[event] ??= [];

  if (hasBurnlogHook(settings.hooks[event])) {
    let updated = false;
    for (const group of settings.hooks[event]) for (const hook of group.hooks ?? []) {
      if (BURNLOG_HOOK_RE.test(hook.command ?? "") && opts.command && hook.command !== opts.command) {
        hook.command = opts.command;
        updated = true;
      }
    }
    if (updated) saveSettings(path, settings);
    return { status: updated ? "updated" : "exists", event, path };
  }

  settings.hooks[event].push({
    hooks: [
      {
        type: "command",
        // Detached, not merely backgrounded: a blocking hook gets killed as
        // the session tears down, and a sync walking thousands of log files
        // loses that race. `--background` re-spawns the sync detached (see
        // sync.ts), which works on macOS too, unlike the old `setsid`.
        //
        // `|| true` so a sync failure never crashes Claude Code.
        command: opts.command ?? HOOK_COMMAND,
      },
    ],
  });

  saveSettings(path, settings);
  return { status: "installed", event, path };
}

export function install(args: string[]): void {
  if (!args.includes("--schedule-only")) {
    const { status, event, path } = installHook({
      event: args.includes("--on-stop") ? "Stop" : "SessionEnd",
      command: burnlogOnPath() ? HOOK_COMMAND : NPX_HOOK_COMMAND,
    });
    console.log(status === "exists" ? pc.yellow("burnlog hook already installed") : pc.green("✓") + ` ${status} burnlog hook`);
    console.log("  event: " + pc.cyan(event));
    console.log("  file:  " + pc.dim(path));
  }
  const sched = installSchedule();
  console.log(sched.status === "installed"
    ? pc.green("✓") + " 30-minute sync schedule installed"
    : pc.yellow(`30-minute schedule unavailable: ${sched.reason}`));
  console.log(pc.dim("remove with: ") + pc.bold("burnlog uninstall"));
}

export function uninstall(_args: string[]): void {
  if (removeSchedule()) console.log(pc.green("✓") + " removed the 30-minute sync schedule");
  const path = settingsPath();
  if (!existsSync(path)) {
    console.log(pc.yellow("no ~/.claude/settings.json — nothing to remove"));
    return;
  }
  const settings = loadSettings(path);
  let removed = 0;

  if (settings.hooks) {
    for (const [event, groups] of Object.entries(settings.hooks)) {
      const filtered: ClaudeHookGroup[] = [];
      for (const g of groups ?? []) {
        const kept = (g.hooks ?? []).filter(
          (h) => !BURNLOG_HOOK_RE.test(h.command ?? ""),
        );
        if (kept.length !== (g.hooks ?? []).length) removed += (g.hooks ?? []).length - kept.length;
        if (kept.length > 0) filtered.push({ ...g, hooks: kept });
      }
      if (filtered.length > 0) settings.hooks[event] = filtered;
      else delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  saveSettings(path, settings);

  if (removed === 0) {
    console.log(pc.yellow("no burnlog hook found in ") + pc.dim(path));
  } else {
    console.log(pc.green("✓") + ` removed ${removed} burnlog hook entr${removed === 1 ? "y" : "ies"}`);
    console.log("  " + pc.dim(path));
  }
}

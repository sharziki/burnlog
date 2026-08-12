import pc from "picocolors";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

type ClaudeHook = { type: string; command: string };
type ClaudeHookGroup = { matcher?: string; hooks: ClaudeHook[] };
type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookGroup[]>;
  [k: string]: unknown;
};

const BURNLOG_MARK = "burnlog sync";

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
    (g.hooks ?? []).some((h) => h.command?.includes(BURNLOG_MARK)),
  );
}

export function install(args: string[]): void {
  const event =
    args.includes("--on-stop") ? "Stop" : "SessionEnd";
  const path = settingsPath();
  const settings = loadSettings(path);

  settings.hooks ??= {};
  settings.hooks[event] ??= [];

  if (hasBurnlogHook(settings.hooks[event])) {
    console.log(pc.yellow("burnlog hook already installed for ") + pc.bold(event));
    console.log("  " + pc.dim(path));
    return;
  }

  settings.hooks[event].push({
    hooks: [
      {
        type: "command",
        // Detached, not merely backgrounded.
        //
        // A blocking hook gets killed when the session tears down — which
        // shows up as "Hook cancelled" every time you exit — and a full sync
        // walks thousands of log files, so it loses that race constantly.
        // `setsid` puts the sync in its own session so it outlives the exit
        // and finishes uploading in peace.
        //
        // `|| true` so a sync failure never crashes Claude Code.
        command: "(setsid burnlog sync --quiet >/dev/null 2>&1 &) || true",
      },
    ],
  });

  saveSettings(path, settings);

  console.log(pc.green("✓") + " installed burnlog hook");
  console.log("  event: " + pc.cyan(event));
  console.log("  file:  " + pc.dim(path));
  console.log();
  console.log(pc.dim("burnlog will now auto-sync when a Claude Code session ends."));
  console.log(pc.dim("remove with: ") + pc.bold("burnlog uninstall"));
}

export function uninstall(_args: string[]): void {
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
          (h) => !h.command?.includes(BURNLOG_MARK),
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

import { homedir } from "os";
import { basename, join, sep } from "path";
import type { Adapter, ScanOptions, ScanResult } from "./types.js";
import { EventSet, collectFiles, envPath, isDir, notInstalled } from "./jsonl-kit.js";
import { parseBuddyExtensionLog, parseBuddyJsonl } from "./tencent-buddy.js";

/**
 * Tencent CodeBuddy. Formats: tencent-buddy.ts. Paths, as tokscale scans them:
 *
 *   - CLI / WebUI transcripts: `~/.codebuddy/projects/<project-key>/*.jsonl`
 *     (every OS).
 *   - IDE extension logs (Windows only; tokscale resolves them home-relative
 *     and via %LOCALAPPDATA% / %APPDATA%):
 *       `AppData/Local/CodeBuddyExtension/Logs/{CodeBuddyIDE,VSCode}/**.log`
 *       `AppData/Roaming/{CodeBuddy CN,Code}/logs/**` — only logs below a
 *       `Tencent-Cloud.coding-copilot` directory (other extensions' siblings
 *       under `exthost/` are pruned, the tree can hold tens of thousands).
 *
 * Model fallback is "codebuddy". Override the transcript root with
 * BURNLOG_CODEBUDDY_DIR (log roots are then not scanned).
 */

const DEFAULT_MODEL = "codebuddy";
const EXT = "tencent-cloud.coding-copilot";

function logRoots(): Array<{ root: string; extOnly: boolean }> {
  if (process.platform !== "win32") return [];
  const home = homedir();
  const local = [join(home, "AppData", "Local")];
  const roaming = [join(home, "AppData", "Roaming")];
  const la = envPath("LOCALAPPDATA");
  const ra = envPath("APPDATA");
  if (la) local.push(la);
  if (ra) roaming.push(ra);
  const out: Array<{ root: string; extOnly: boolean }> = [];
  for (const l of local) {
    for (const sub of ["CodeBuddyIDE", "VSCode"]) out.push({ root: join(l, "CodeBuddyExtension", "Logs", sub), extOnly: false });
  }
  for (const r of roaming) {
    out.push({ root: join(r, "CodeBuddy CN", "logs"), extOnly: true });
    out.push({ root: join(r, "Code", "logs"), extOnly: true });
  }
  return out;
}

export class CodebuddyAdapter implements Adapter {
  readonly name = "codebuddy" as const;

  private get projects(): string {
    return envPath("BURNLOG_CODEBUDDY_DIR") ?? join(homedir(), ".codebuddy", "projects");
  }

  private logs(): Array<{ root: string; extOnly: boolean }> {
    return envPath("BURNLOG_CODEBUDDY_DIR") ? [] : logRoots();
  }

  detect(): boolean {
    return isDir(this.projects) || this.logs().some((l) => isDir(l.root));
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const events = new EventSet();
    let scannedFiles = 0;
    let totalLines = 0;
    let any = false;

    const jsonl = collectFiles([this.projects], (n) => n.toLowerCase().endsWith(".jsonl"), opts);
    any ||= jsonl.anyRoot;
    for (const f of jsonl.files) {
      const r = parseBuddyJsonl(this.name, DEFAULT_MODEL, f);
      scannedFiles++;
      totalLines += r.lines;
      r.events.forEach((e) => events.add(e));
    }

    for (const { root, extOnly } of this.logs()) {
      const match = (n: string, full: string): boolean =>
        n.toLowerCase().endsWith(".log") && (!extOnly || full.toLowerCase().split(sep).includes(EXT));
      // Prune other extensions' directories under `exthost/`.
      const skip = (n: string, full: string): boolean =>
        extOnly && basename(join(full, "..")).toLowerCase() === "exthost" && n.toLowerCase() !== EXT;
      const logs = collectFiles([root], match, opts, skip);
      any ||= logs.anyRoot;
      for (const f of logs.files) {
        const r = parseBuddyExtensionLog(this.name, DEFAULT_MODEL, f);
        scannedFiles++;
        totalLines += r.lines;
        r.events.forEach((e) => events.add(e));
      }
    }

    if (!any) return notInstalled(this.name);
    return { source: this.name, events: events.values(), scannedFiles, totalLines };
  }
}

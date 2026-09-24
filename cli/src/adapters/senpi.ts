import { closeSync, openSync, readSync, readdirSync } from "fs";
import { isAbsolute, join } from "path";
import { envPath, isDir, parseJson, readLines } from "./jsonl-kit.js";
import { PiFamilyAdapter } from "./pi-format.js";

/**
 * Senpi (OmO Native) — a pi-mono descendant writing the Pi session format
 * (pi-format.ts). `usage.reasoning` is a subset of `output` and is not added;
 * `session_info.name` is a human title and is never read.
 *
 * Roots, as tokscale scans them:
 *   - `$SENPI_CODING_AGENT_DIR/sessions` (default `~/.senpi/agent/sessions`)
 *   - `$SENPI_CODING_AGENT_SESSION_DIR`, when set
 *   - OmO task children, which OmO redirects into each project's
 *     `<project>/.omo/senpi-task/children` (or `<task.state_dir>/children`
 *     from `.omo/omo.json[c]`). Projects are found from `~`, the current
 *     directory, and the `cwd` recorded in every global session header — the
 *     cwd is only used to locate those directories, never reported.
 *
 * Override every root with BURNLOG_SENPI_DIR.
 */

type TaskState = { kind: "unset" } | { kind: "default" } | { kind: "dir"; path: string };

/** JSONC → JSON, enough for OmO's config: comments and trailing commas. */
function parseJsonc(text: string): Record<string, unknown> | undefined {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else {
      out += c;
    }
  }
  return parseJson(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** OmO's `task.state_dir` from one `.omo` directory (omo.jsonc, then omo.json). */
function omoTaskState(omoDir: string): TaskState {
  for (const name of ["omo.jsonc", "omo.json"]) {
    const lines = readLines(join(omoDir, name));
    if (lines.length === 0) continue;
    const config = parseJsonc(lines.join("\n"));
    if (!config) continue;
    const task = config.task as Record<string, unknown> | undefined;
    if (!task || typeof task !== "object") return { kind: "unset" };
    const dir = task.state_dir;
    return typeof dir === "string" && isAbsolute(dir) ? { kind: "dir", path: dir } : { kind: "default" };
  }
  return { kind: "unset" };
}

function childrenRoot(projectDir: string, userStateDir: string | undefined): string {
  const own = omoTaskState(join(projectDir, ".omo"));
  const stateDir =
    own.kind === "dir"
      ? own.path
      : own.kind === "default"
        ? join(projectDir, ".omo", "senpi-task")
        : (userStateDir ?? join(projectDir, ".omo", "senpi-task"));
  return join(stateDir, "children");
}

/** First line of a file, reading at most 8 KiB (the header is well under 1 KiB). */
function firstLine(file: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(8192);
    const len = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, len).toString("utf8").replace(/^\uFEFF/, "").split("\n")[0].trim();
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Every distinct header `cwd` under `sessions/<encoded-cwd>/*.jsonl`. */
function projectCwds(sessionsRoot: string): string[] {
  const cwds = new Set<string>();
  let dirs: string[] = [];
  try {
    dirs = readdirSync(sessionsRoot);
  } catch {
    return [];
  }
  for (const d of dirs) {
    const dir = join(sessionsRoot, d);
    if (!isDir(dir)) continue;
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const first = firstLine(join(dir, f));
      const header = first ? parseJson(first) : undefined;
      if (header?.type === "session" && typeof header.cwd === "string" && isAbsolute(header.cwd)) {
        cwds.add(header.cwd);
      }
    }
  }
  return [...cwds];
}

export class SenpiAdapter extends PiFamilyAdapter {
  readonly name = "senpi" as const;
  protected readonly lane = "standard-deduped" as const;

  protected roots(): string[] {
    const explicit = envPath("BURNLOG_SENPI_DIR");
    if (explicit) return [explicit];

    const home = this.home();
    const agentDir = envPath("SENPI_CODING_AGENT_DIR") ?? join(home, ".senpi", "agent");
    const sessionDir = envPath("SENPI_CODING_AGENT_SESSION_DIR");
    const user = omoTaskState(join(home, ".omo"));
    const userStateDir = user.kind === "dir" ? user.path : undefined;

    const sessionsRoots = [join(agentDir, "sessions"), ...(sessionDir ? [sessionDir] : [])];
    const roots = [...sessionsRoots];
    roots.push(childrenRoot(process.cwd(), userStateDir));
    for (const s of sessionsRoots) {
      for (const cwd of projectCwds(s)) roots.push(childrenRoot(cwd, userStateDir));
    }
    roots.push(childrenRoot(home, userStateDir));
    return [...new Set(roots)];
  }
}

import { createHash } from "crypto";
import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Small helpers shared by the file-based adapters ported from tokscale
 * (gemini, amp, droid, the Cline family, ...). Nothing here reads file
 * contents — each adapter decides what it keeps, and keeps only tokens.
 */

/** A finite, positive integer, or 0. Token fields arrive as anything. */
export function num(v: unknown): number {
  if (typeof v === "string" && v.trim() !== "") v = Number(v);
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Opaque, stable id. Use whenever the natural key is (or contains) a path,
 * project name, or session title: the digest carries none of it.
 */
export function hashId(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/** An env var's value when it is set and non-blank. */
export function envDir(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

/** `$VAR` when set, else `~/<fallback>` — tokscale's `PathRoot::EnvVar`. */
export function envOrHome(name: string, ...fallback: string[]): string {
  return envDir(name) ?? join(homedir(), ...fallback);
}

/** XDG data home: `$XDG_DATA_HOME` or `~/.local/share` (tokscale's `XdgData`). */
export function xdgData(): string {
  return envDir("XDG_DATA_HOME") ?? join(homedir(), ".local", "share");
}

/**
 * Per-user app-data dir (tokscale's `AppData`): `%APPDATA%` on Windows,
 * `~/Library/Application Support` on macOS, `$XDG_CONFIG_HOME` or `~/.config`
 * elsewhere.
 */
export function appData(): string {
  const home = homedir();
  if (process.platform === "win32") return envDir("APPDATA") ?? join(home, "AppData", "Roaming");
  if (process.platform === "darwin") return join(home, "Library", "Application Support");
  return envDir("XDG_CONFIG_HOME") ?? join(home, ".config");
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function firstExisting(paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

/**
 * Recursively list files under `root` whose basename passes `match`.
 * Symlinked directories are not followed (cycles); unreadable dirs are skipped.
 */
export function walkFiles(root: string, match: (name: string) => boolean, maxDepth = 16): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) visit(full, depth + 1);
      else if (e.isFile() && match(e.name)) out.push(full);
    }
  };
  visit(root, 0);
  return out;
}

/** Parse a timestamp (ISO string, epoch s or ms) into ms, or undefined. */
export function toMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // Heuristic shared with tokscale: values below 1e12 are epoch seconds.
    return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  }
  if (typeof v === "string" && v.trim()) {
    const asNum = Number(v);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(v.trim())) return toMs(asNum);
    // A timezone-less ISO datetime is UTC (tokscale's rule), not local time,
    // which is what Date.parse would otherwise assume.
    const s = v.trim();
    const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
    const t = Date.parse(naive ? `${s.replace(" ", "T")}Z` : s);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

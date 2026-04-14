import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, ScanResult } from "./types.js";

/**
 * openclaw adapter — STUB.
 *
 * ~/.openclaw/logs currently only contains config-audit.jsonl, not token
 * usage. Once openclaw writes per-request usage (e.g. to ~/.openclaw/usage/)
 * fill this in. Override the scan root with BURNLOG_OPENCLAW_DIR.
 */
export class OpenclawAdapter implements Adapter {
  readonly name = "openclaw" as const;

  private get root(): string | null {
    const explicit = process.env.BURNLOG_OPENCLAW_DIR;
    if (explicit) return explicit;
    const guess = join(homedir(), ".openclaw");
    return existsSync(guess) ? guess : null;
  }

  detect(): boolean {
    return this.root !== null;
  }

  scan(): ScanResult {
    if (!this.detect()) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "not installed",
      };
    }
    return {
      source: this.name,
      events: [],
      scannedFiles: 0,
      totalLines: 0,
      note: "detected, but openclaw does not yet write token usage to disk — parser stubbed",
    };
  }
}

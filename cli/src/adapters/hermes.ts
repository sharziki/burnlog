import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, ScanResult } from "./types.js";

/**
 * Hermes agent adapter — STUB.
 *
 * Hermes does not yet write token usage to a known path on disk. Once it
 * does, this adapter should parse whatever format it lands in and return
 * BurnEvents with source: "hermes".
 *
 * Set BURNLOG_HERMES_DIR to point at a log directory when one exists.
 */
export class HermesAdapter implements Adapter {
  readonly name = "hermes" as const;

  private get root(): string | null {
    const explicit = process.env.BURNLOG_HERMES_DIR;
    if (explicit) return explicit;
    const guess = join(homedir(), ".hermes");
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
        note: "not installed (set BURNLOG_HERMES_DIR once hermes writes usage logs)",
      };
    }
    return {
      source: this.name,
      events: [],
      scannedFiles: 0,
      totalLines: 0,
      note: "detected, but parser not yet implemented — drop a sample log in burnlog/cli/samples/hermes/",
    };
  }
}

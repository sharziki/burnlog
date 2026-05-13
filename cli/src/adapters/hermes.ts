import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, ScanResult } from "./types.js";

/**
 * Hermes agent adapter.
 *
 * burnlog can label Hermes as a source, but passive local log ingestion is not
 * supported yet. Hermes users should track usage via @sxna/burnlog-sdk or
 * another explicit integration path until a stable on-disk usage format exists.
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
        note: "SDK/manual integration only today; local Hermes log ingestion is not supported yet",
      };
    }
    return {
      source: this.name,
      events: [],
      scannedFiles: 0,
      totalLines: 0,
      note: "Hermes detected, but burnlog cannot read Hermes usage logs yet; use SDK/manual integration",
    };
  }
}

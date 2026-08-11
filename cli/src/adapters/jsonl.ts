import { existsSync } from "fs";
import type { Adapter, ScanResult } from "./types.js";
import { readSink, sinkDir } from "../sink.js";

/**
 * The open sink adapter — reads whatever anything has appended to
 * `~/.burnlog/events/*.jsonl`. This is how `burnlog wrap` gets its events
 * uploaded, and how any tool burnlog doesn't ship an adapter for can
 * participate without waiting on us.
 */
export class JsonlAdapter implements Adapter {
  readonly name = "jsonl" as const;

  detect(): boolean {
    return existsSync(sinkDir());
  }

  scan(): ScanResult {
    if (!this.detect()) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "no events written yet — try `burnlog wrap -- <your command>`",
      };
    }
    const { events, files, lines } = readSink();
    return { source: this.name, events, scannedFiles: files, totalLines: lines };
  }
}

import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { HermesAdapter } from "./hermes.js";
import { JsonlAdapter } from "./jsonl.js";
import { OpenclawAdapter } from "./openclaw.js";
import { OpencodeAdapter } from "./opencode.js";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";

export { totalTokens, providerFromModel, splitOversized, MAX_EVENT_TOKENS } from "./types.js";
export type { Adapter, BurnEvent, ScanOptions, ScanResult, AdapterName } from "./types.js";

export const adapters: Adapter[] = [
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new HermesAdapter(),
  new OpenclawAdapter(),
  new OpencodeAdapter(),
  // Last so `burnlog scan` reads log-scrapers first, then anything the proxy
  // or a third-party tool dropped in the open sink.
  new JsonlAdapter(),
];

/**
 * Run every adapter. One adapter throwing (a format changed under us, a
 * database locked) must not cost the user every other source, so a failure
 * becomes an empty result with the reason in `note`.
 */
export async function scanAll(opts: ScanOptions = {}): Promise<ScanResult[]> {
  return Promise.all(
    adapters.map(async (a): Promise<ScanResult> => {
      try {
        return await a.scan(opts);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { source: a.name, events: [], scannedFiles: 0, totalLines: 0, note: `failed: ${reason}` };
      }
    }),
  );
}

export function flatten(results: ScanResult[]): BurnEvent[] {
  return results.flatMap((r) => r.events);
}

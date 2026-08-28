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

export function scanAll(opts: ScanOptions = {}): ScanResult[] {
  return adapters.map((a) => a.scan(opts));
}

export function flatten(results: ScanResult[]): BurnEvent[] {
  return results.flatMap((r) => r.events);
}

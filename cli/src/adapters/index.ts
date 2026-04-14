import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { HermesAdapter } from "./hermes.js";
import { OpenclawAdapter } from "./openclaw.js";
import type { Adapter, BurnEvent, ScanResult } from "./types.js";

export { totalTokens, providerFromModel } from "./types.js";
export type { Adapter, BurnEvent, ScanResult, AdapterName } from "./types.js";

export const adapters: Adapter[] = [
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new HermesAdapter(),
  new OpenclawAdapter(),
];

export function scanAll(): ScanResult[] {
  return adapters.map((a) => a.scan());
}

export function flatten(results: ScanResult[]): BurnEvent[] {
  return results.flatMap((r) => r.events);
}

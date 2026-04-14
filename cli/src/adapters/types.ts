/**
 * A single burn event as reported by an adapter.
 *
 * PRIVACY: Intentionally does NOT carry project, cwd, prompt text, filenames,
 * sessionId, or anything else that could identify what the user was working on.
 * Only tokens + model + opaque random dedupe id.
 */
export type BurnEvent = {
  /** Random opaque id from the source CLI, unique within that source. */
  requestId: string;
  /** Which adapter produced this event. */
  source: AdapterName;
  /** Model name as reported by the source CLI. */
  model: string;
  /** Inferred from model name. */
  provider: "anthropic" | "openai" | "google" | "other";
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** ISO timestamp string. */
  timestamp: string;
};

export type AdapterName = "claude-code" | "codex" | "hermes" | "openclaw";

export type ScanResult = {
  source: AdapterName;
  events: BurnEvent[];
  scannedFiles: number;
  totalLines: number;
  /** Human-readable note about what happened (e.g. "not installed", "stub"). */
  note?: string;
};

export interface Adapter {
  readonly name: AdapterName;
  /** True if this source appears to exist on disk. */
  detect(): boolean;
  /** Parse all available history into burn events. */
  scan(): ScanResult;
}

export function providerFromModel(model: string): BurnEvent["provider"] {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4") || m.startsWith("codex"))
    return "openai";
  if (m.includes("gemini")) return "google";
  return "other";
}

export function totalTokens(e: BurnEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

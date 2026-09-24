import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { CursorAdapter } from "./cursor.js";
import { GeminiAdapter } from "./gemini.js";
import { CopilotAdapter } from "./copilot.js";
import { CopilotDesktopAdapter } from "./copilot-desktop.js";
import { CopilotSessionStoreAdapter } from "./copilot-session-store.js";
import { CopilotVscodeAdapter } from "./copilot-vscode.js";
import { OpencodeAdapter } from "./opencode.js";
import { PiAdapter } from "./pi.js";
import { AmpAdapter } from "./amp.js";
import { DroidAdapter } from "./droid.js";
import { ClineAdapter } from "./cline.js";
import { RoocodeAdapter } from "./roocode.js";
import { KilocodeAdapter } from "./kilocode.js";
import { KiloAdapter } from "./kilo.js";
import { GooseAdapter } from "./goose.js";
import { ZedAdapter } from "./zed.js";
import { QwenAdapter } from "./qwen.js";
import { KimiAdapter } from "./kimi.js";
import { HermesAdapter } from "./hermes.js";
import { OpenclawAdapter } from "./openclaw.js";
import { AntigravityAdapter } from "./antigravity.js";
import { AntigravityCliAdapter } from "./antigravity-cli.js";
import { JunieAdapter } from "./junie.js";
import { KiroAdapter } from "./kiro.js";
import { GrokAdapter } from "./grok.js";
import { JcodeAdapter } from "./jcode.js";
import { AugmentAdapter } from "./augment.js";
import { DevinCliAdapter } from "./devin-cli.js";
import { DevinDesktopAdapter } from "./devin-desktop.js";
import { OmpAdapter } from "./omp.js";
import { KimchiAdapter } from "./kimchi.js";
import { SenpiAdapter } from "./senpi.js";
import { PrimeAgentAdapter } from "./prime-agent.js";
import { GjcAdapter } from "./gjc.js";
import { CommandcodeAdapter } from "./commandcode.js";
import { ZcodeAdapter } from "./zcode.js";
import { CodebuddyAdapter } from "./codebuddy.js";
import { WorkbuddyAdapter } from "./workbuddy.js";
import { CodebuffAdapter } from "./codebuff.js";
import { FreebuffAdapter } from "./freebuff.js";
import { MuxAdapter } from "./mux.js";
import { TraeAdapter } from "./trae.js";
import { FxAdapter } from "./fx.js";
import { DshAdapter } from "./dsh.js";
import { ReasonixAdapter } from "./reasonix.js";
import { McodeAdapter } from "./mcode.js";
import { MicodeAdapter } from "./micode.js";
import { CherrystudioAdapter } from "./cherrystudio.js";
import { OpencodereviewAdapter } from "./opencodereview.js";
import { LmstudioAdapter } from "./lmstudio.js";
import { UnslothAdapter } from "./unsloth.js";
import { HindsightAdapter } from "./hindsight.js";
import { MuseAdapter } from "./muse.js";
import { SyntheticAdapter } from "./synthetic.js";
import { JsonlAdapter } from "./jsonl.js";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";

export { totalTokens, providerFromModel, splitOversized, MAX_EVENT_TOKENS } from "./types.js";
export type { Adapter, BurnEvent, ScanOptions, ScanResult, AdapterName } from "./types.js";

export const adapters: Adapter[] = [
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new CursorAdapter(),
  new GeminiAdapter(),
  new CopilotAdapter(),
  new CopilotDesktopAdapter(),
  new CopilotSessionStoreAdapter(),
  new CopilotVscodeAdapter(),
  new OpencodeAdapter(),
  new PiAdapter(),
  new AmpAdapter(),
  new DroidAdapter(),
  new ClineAdapter(),
  new RoocodeAdapter(),
  new KilocodeAdapter(),
  new KiloAdapter(),
  new GooseAdapter(),
  new ZedAdapter(),
  new QwenAdapter(),
  new KimiAdapter(),
  new HermesAdapter(),
  new OpenclawAdapter(),
  new AntigravityAdapter(),
  new AntigravityCliAdapter(),
  new JunieAdapter(),
  new KiroAdapter(),
  new GrokAdapter(),
  new JcodeAdapter(),
  new AugmentAdapter(),
  new DevinCliAdapter(),
  new DevinDesktopAdapter(),
  new OmpAdapter(),
  new KimchiAdapter(),
  new SenpiAdapter(),
  new PrimeAgentAdapter(),
  new GjcAdapter(),
  new CommandcodeAdapter(),
  new ZcodeAdapter(),
  new CodebuddyAdapter(),
  new WorkbuddyAdapter(),
  new CodebuffAdapter(),
  new FreebuffAdapter(),
  new MuxAdapter(),
  new TraeAdapter(),
  new FxAdapter(),
  new DshAdapter(),
  new ReasonixAdapter(),
  new McodeAdapter(),
  new MicodeAdapter(),
  new CherrystudioAdapter(),
  new OpencodereviewAdapter(),
  new LmstudioAdapter(),
  new UnslothAdapter(),
  new HindsightAdapter(),
  new MuseAdapter(),
  new SyntheticAdapter(),
  // Last so `burnlog scan` reads log-scrapers first, then anything the proxy
  // or a third-party tool dropped in the open sink.
  new JsonlAdapter(),
];

/**
 * Run every adapter. One adapter throwing (a format changed under us, a
 * database locked) must not cost the user every other source, so a failure
 * becomes an empty result with the reason in `note`.
 */
export async function scanAll(opts: ScanOptions = {}, fullFor: ReadonlySet<string> = new Set()): Promise<ScanResult[]> {
  return Promise.all(
    adapters.map(async (a): Promise<ScanResult> => {
      try {
        return await a.scan(fullFor.has(a.name) ? { ...opts, since: undefined } : opts);
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

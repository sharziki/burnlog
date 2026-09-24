import { join } from "path";
import { envPath } from "./jsonl-kit.js";
import { PiFamilyAdapter } from "./pi-format.js";

/**
 * Pi (badlogic/pi-mono) — `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`, the
 * same path on Linux, macOS and Windows. Format and dedupe: see pi-format.ts.
 *
 * Pi itself reads PI_CODING_AGENT_DIR, but Oh My Pi reads the same variable,
 * so tokscale deliberately keeps a fixed home-relative root for both rather
 * than let one override point two clients at one tree. burnlog follows that;
 * override the scan root with BURNLOG_PI_DIR.
 */
export class PiAdapter extends PiFamilyAdapter {
  readonly name = "pi" as const;
  protected readonly lane = "standard-deduped" as const;

  protected roots(): string[] {
    return [envPath("BURNLOG_PI_DIR") ?? join(this.home(), ".pi", "agent", "sessions")];
  }
}

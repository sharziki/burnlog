import { join } from "path";
import { envPath } from "./jsonl-kit.js";
import { PiFamilyAdapter } from "./pi-format.js";

/**
 * Oh My Pi (omp) — a pi-mono descendant writing the Pi session format
 * (pi-format.ts) under `~/.omp/agent/sessions`, one level deeper than Pi:
 * `<encoded-cwd>/<ts>_<uuid>.jsonl`, with subagent and advisor runs as
 * standalone session files in a sibling `<ts>_<uuid>/` directory. The
 * recursive scan reads each on its own.
 *
 * No upstream env var is honoured (omp shares PI_CODING_AGENT_DIR with Pi;
 * see pi.ts). Override the scan root with BURNLOG_OMP_DIR.
 */
export class OmpAdapter extends PiFamilyAdapter {
  readonly name = "omp" as const;
  protected readonly lane = "standard-deduped" as const;

  protected roots(): string[] {
    return [envPath("BURNLOG_OMP_DIR") ?? join(this.home(), ".omp", "agent", "sessions")];
  }
}

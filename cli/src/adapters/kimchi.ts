import { join } from "path";
import { envPath } from "./jsonl-kit.js";
import { PiFamilyAdapter } from "./pi-format.js";

/**
 * Kimchi Coding — Pi session format (pi-format.ts) under its agent dir:
 * `$KIMCHI_CODING_AGENT_DIR/sessions`, default `~/.config/kimchi/harness/sessions`
 * on every OS (tokscale resolves it home-relative, not via XDG).
 *
 * Unlike the rest of the Pi family, Kimchi's dedupe key is session-scoped
 * (`<session>:<entry id>`), matching tokscale.
 *
 * Override the scan root with BURNLOG_KIMCHI_DIR.
 */
export class KimchiAdapter extends PiFamilyAdapter {
  readonly name = "kimchi" as const;
  protected readonly lane = "standard" as const;

  protected roots(): string[] {
    const explicit = envPath("BURNLOG_KIMCHI_DIR");
    if (explicit) return [explicit];
    const agentDir = envPath("KIMCHI_CODING_AGENT_DIR") ?? join(this.home(), ".config", "kimchi", "harness");
    return [join(agentDir, "sessions")];
  }
}

import { VscodeTaskAdapter } from "./vscode-tasks.js";

/**
 * Kilo Code (the VS Code extension, not the `kilo` CLI) — task logs under
 * `<globalStorage>/kilocode.kilo-code/tasks/<id>/ui_messages.json` on Linux,
 * macOS, Windows and VS Code Server. Same format as Cline; see
 * vscode-tasks.ts. Override the tasks root with BURNLOG_KILOCODE_DIR.
 */
export class KilocodeAdapter extends VscodeTaskAdapter {
  constructor() {
    super("kilocode", "kilocode.kilo-code", "BURNLOG_KILOCODE_DIR");
  }
}

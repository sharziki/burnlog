import { VscodeTaskAdapter } from "./vscode-tasks.js";

/**
 * Roo Code — VS Code extension `rooveterinaryinc.roo-cline` task logs
 * (`<globalStorage>/rooveterinaryinc.roo-cline/tasks/<id>/ui_messages.json`)
 * on Linux, macOS, Windows and VS Code Server. Same format as Cline; see
 * vscode-tasks.ts. Override the tasks root with BURNLOG_ROOCODE_DIR.
 */
export class RoocodeAdapter extends VscodeTaskAdapter {
  constructor() {
    super("roocode", "rooveterinaryinc.roo-cline", "BURNLOG_ROOCODE_DIR");
  }
}

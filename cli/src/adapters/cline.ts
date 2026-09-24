import { VscodeTaskAdapter } from "./vscode-tasks.js";

/**
 * Cline — VS Code extension `saoudrizwan.claude-dev` task logs
 * (`<globalStorage>/saoudrizwan.claude-dev/tasks/<id>/ui_messages.json`) on
 * Linux (~/.config/Code), macOS (~/Library/Application Support/Code),
 * Windows (%APPDATA%\Code) and VS Code Server, plus Cline CLI sessions
 * (`~/.cline/data/sessions/<id>/<id>.messages.json`, relocated by
 * CLINE_SESSION_DATA_DIR / CLINE_DATA_DIR / CLINE_DIR). Format notes live in
 * vscode-tasks.ts. Override every root with BURNLOG_CLINE_DIR.
 */
export class ClineAdapter extends VscodeTaskAdapter {
  constructor() {
    super("cline", "saoudrizwan.claude-dev", "BURNLOG_CLINE_DIR", true);
  }
}

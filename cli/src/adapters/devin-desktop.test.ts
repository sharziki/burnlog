import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DevinDesktopAdapter } from "./devin-desktop.js";

const SCHEMA = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, backend_type TEXT NOT NULL,
  model TEXT NOT NULL, title TEXT, agent_mode TEXT NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL);
CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, node_id INTEGER NOT NULL,
  parent_node_id INTEGER, chat_message TEXT NOT NULL, created_at INTEGER NOT NULL, metadata TEXT);`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Fixture = {
  files: Record<string, string[]>;
  sessions?: Array<{ id: string; model: string; title?: string }>;
  nodes?: Array<{ session: string; chat: string }>;
};

function setup(f: Fixture): void {
  const root = mkdtempSync(join(tmpdir(), "bl-devin-"));
  const events = join(root, "acp-events");
  mkdirSync(events, { recursive: true });
  for (const [name, lines] of Object.entries(f.files)) writeFileSync(join(events, name), lines.join("\n") + "\n");
  const cli = join(root, "cli");
  mkdirSync(cli);
  if (f.sessions) {
    let sql = SCHEMA;
    for (const s of f.sessions)
      sql += `INSERT INTO sessions VALUES (${q(s.id)}, '/Users/alice/p', 'windsurf', ${q(s.model)}, ${s.title ? q(s.title) : "NULL"}, 'accept-edits', 1, 1);`;
    for (const n of f.nodes ?? [])
      sql += `INSERT INTO message_nodes (session_id, node_id, chat_message, created_at) VALUES (${q(n.session)}, 1, ${q(n.chat)}, 1700000000);`;
    execFileSync("sqlite3", [join(cli, "sessions.db"), sql]);
  }
  process.env.BURNLOG_DEVIN_DESKTOP_DIR = events;
  process.env.BURNLOG_DEVIN_CLI_DIR = cli;
}

const scan = (since?: Date) => new DevinDesktopAdapter().scan({ since });

test("devin-desktop: legacy embedded metrics, one event per non-zero line", async () => {
  setup({
    files: {
      "event.ndjson": [
        `{"providerId":"devin-cli","notification":{"content":{"text":"hello"},"metadata":{"input_tokens":100,"output_tokens":50,"generation_model":"claude-sonnet-4","created_at":"2026-06-16T12:00:00Z"}}}`,
        `{"providerId":"devin-cli","notification":{"content":{"text":"hi"},"metadata":{"input_tokens":0,"output_tokens":0}}}`,
        `{"providerId":"devin-cli","notification":{"metadata":{"input_tokens":10,"output_tokens":5,"generation_model":"gpt-5","created_at":"2026-06-16T12:00:00Z"}}}`,
        `{"providerId":"devin-cli","notification":{"metadata":{"input_tokens":10,"output_tokens":5,"generation_model":"gpt-5","created_at":"2026-06-16T12:00:00Z"}}}`,
      ],
      "legacy-usage-update.ndjson": [
        `{"notification":{"sessionUpdate":"usage_update","metadata":{"input_tokens":12,"output_tokens":3,"generation_model":"gpt-5"}}}`,
      ],
    },
  });
  const r = await scan();
  assert.equal(r.events.length, 4, "identical usage on distinct lines stays distinct");
  const c = r.events.find((e) => e.model === "claude-sonnet-4")!;
  assert.equal(c.provider, "anthropic");
  assert.deepEqual([c.inputTokens, c.outputTokens], [100, 50]);
  assert.equal(c.timestamp, new Date(1_781_611_200_000).toISOString());
  assert.ok(r.events.some((e) => e.model === "gpt-5" && e.inputTokens === 12));
});

test("devin-desktop: ACP usage aggregates (cumulative input, summed output) and resolves the CLI title", async () => {
  setup({
    sessions: [{ id: "cli-session-1", model: "gpt-5", title: "Build the release" }],
    files: {
      "desktop-file-id.ndjson": [
        `{"notification":{"sessionUpdate":"session_info_update","title":"Build the release"}}`,
        `{"notification":{"sessionUpdate":"session_info_update"}}`,
        `{"notification":{"sessionUpdate":"usage_update","_meta":{"cognition.ai/inputTokens":100,"cognition.ai/outputTokens":7,"cognition.ai/cachedReadTokens":20}}}`,
        `{"notification":{"sessionUpdate":"usage_update","_meta":{"cognition.ai/inputTokens":150,"cognition.ai/outputTokens":8,"cognition.ai/cachedReadTokens":30}}}`,
      ],
    },
  });
  const r = await scan();
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.model, "gpt-5");
  assert.deepEqual([e.inputTokens, e.outputTokens, e.cacheReadTokens], [120, 15, 30]);
  assert.ok(!JSON.stringify(e).includes("release"));
});

test("devin-desktop: ambiguous title is not resolved", async () => {
  setup({
    sessions: [
      { id: "cli-session-1", model: "gpt-5", title: "Untitled task" },
      { id: "cli-session-2", model: "claude-sonnet-4", title: "Untitled task" },
    ],
    files: {
      "desktop-file-id.ndjson": [
        `{"notification":{"sessionUpdate":"session_info_update","title":"Untitled task"}}`,
        `{"notification":{"sessionUpdate":"usage_update","_meta":{"cognition.ai/inputTokens":100,"cognition.ai/outputTokens":7}}}`,
      ],
    },
  });
  const r = await scan();
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "devin");
});

const DESKTOP_TASK = {
  "desktop-file.ndjson": [
    `{"notification":{"sessionUpdate":"session_info_update","title":"Desktop task"}}`,
    `{"notification":{"sessionUpdate":"usage_update","_meta":{"cognition.ai/inputTokens":100,"cognition.ai/outputTokens":20,"cognition.ai/cachedReadTokens":10}}}`,
  ],
};

test("devin-desktop: zero-usage CLI session does not suppress the desktop stream", async () => {
  setup({
    sessions: [{ id: "cli-session", model: "gpt-5", title: "Desktop task" }],
    nodes: [{ session: "cli-session", chat: `{"role":"assistant","metadata":{"metrics":{"input_tokens":0,"output_tokens":0}}}` }],
    files: DESKTOP_TASK,
  });
  const r = await scan();
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].model, "gpt-5");
  assert.deepEqual([r.events[0].inputTokens, r.events[0].cacheReadTokens], [90, 10]);
});

test("devin-desktop: CLI session with usage wins; desktop copy is dropped", async () => {
  setup({
    sessions: [{ id: "cli-session", model: "gpt-5", title: "Desktop task" }],
    nodes: [{ session: "cli-session", chat: `{"role":"assistant","metadata":{"metrics":{"input_tokens":50,"output_tokens":25}}}` }],
    files: DESKTOP_TASK,
  });
  const r = await scan();
  assert.equal(r.events.length, 0);
  assert.match(r.note ?? "", /devin-cli/);
});

test("devin-desktop: since filter and not installed", async () => {
  setup({ files: DESKTOP_TASK });
  assert.equal((await scan()).events.length, 1);
  assert.equal((await scan(new Date(Date.now() + 3_600_000))).events.length, 0);
  process.env.BURNLOG_DEVIN_DESKTOP_DIR = join(tmpdir(), "bl-devin-missing-" + process.pid);
  assert.equal(new DevinDesktopAdapter().detect(), false);
  assert.equal((await scan()).note, "not installed");
});

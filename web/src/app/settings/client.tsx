"use client";

import Link from "next/link";
import { useState } from "react";

const CONNECT_COMMANDS = [
  { id: "install", label: "1. Install the CLI", command: "cd cli && npm install && npm link" },
  { id: "login", label: "2. Save your API key", command: "burnlog login <api-key>" },
  { id: "sync", label: "3. Sync your usage", command: "burnlog sync" },
];

const CONNECTORS = [
  { id: "claude", name: "Claude Code", detail: "Reads assistant usage blocks from ~/.claude/projects and dedupes repeated request IDs." },
  { id: "codex", name: "Codex CLI", detail: "Consumes Codex session totals from ~/.codex/sessions for OpenAI-side burn tracking." },
  { id: "hermes", name: "Hermes", detail: "Prepared for multi-provider agent runtime logs once Hermes sessions are available locally." },
  { id: "openclaw", name: "OpenClaw", detail: "Keeps open or self-hosted coding-agent workflows on the same standings surface." },
];

export function SettingsClient({
  username,
  name,
  signOutAction,
}: {
  username: string;
  name: string;
  signOutAction: () => Promise<void>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function createKey() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/key", { method: "POST" });
      const data = (await res.json()) as { key?: string };
      if (data.key) setKey(data.key);
    } finally {
      setLoading(false);
    }
  }

  async function copyValue(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="settings-shell">
      <div className="page-container">
        <div className="topbar settings-topbar">
          <Link className="landing-brand-inline" href="/">
            <div className="brand-mark minimal-mark">BL</div>
            <div>
              <div className="brand-title mono-title">burnlog</div>
              <div className="brand-subtitle">profile settings and source connection</div>
            </div>
          </Link>

          <div className="inline-row">
            <Link className="action-chip" href="/board">Back to board</Link>
            <form action={signOutAction}>
              <button className="action-chip" type="submit">Sign out</button>
            </form>
          </div>
        </div>

        <div className="settings-grid">
          <div className="stack">
            <div className="panel section-panel">
              <div className="eyebrow">Signed in</div>
              <h1 className="section-title" style={{ marginTop: 8 }}>{name}</h1>
              <p className="section-copy">@{username} · this profile owns the upload key used by the Burnlog CLI when you sync real local usage.</p>
              <div className="inline-row" style={{ marginTop: 16 }}>
                <span className="status-pill status-live">Private by default</span>
                <span className="status-pill status-warming">Public standing by choice</span>
              </div>
            </div>

            <div className="panel section-panel">
              <div className="section-header">
                <div>
                  <div className="eyebrow">CLI key</div>
                  <h2 className="section-title">Generate an upload key</h2>
                  <p className="section-copy">This key lets your local CLI sync usage into Burnlog without exposing prompt text, source code, repo names, or file paths.</p>
                </div>
                <button className="button-primary" disabled={loading} onClick={createKey} type="button">
                  {loading ? "Generating..." : "Generate new key"}
                </button>
              </div>

              {key ? (
                <div className="command-block">
                  <div>
                    <div className="metric-label">Copy this once — it will not be shown again</div>
                    <div className="command-text" style={{ marginTop: 8 }}>{key}</div>
                  </div>
                  <button className="button-secondary" onClick={() => copyValue(key, "api-key")} type="button">
                    {copied === "api-key" ? "Copied" : "Copy key"}
                  </button>
                </div>
              ) : (
                <div className="empty-state">No active key shown. Generate one, copy it once, then run the login command below from the machine where your coding-agent logs live.</div>
              )}
            </div>

            <div className="panel section-panel">
              <div className="eyebrow">Quick start</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>From zero to synced profile</h2>
              <div className="stack" style={{ marginTop: 18 }}>
                {CONNECT_COMMANDS.map((item) => (
                  <div className="command-block" key={item.id}>
                    <div>
                      <div className="metric-label">{item.label}</div>
                      <div className="command-text" style={{ marginTop: 8 }}>{item.command}</div>
                    </div>
                    <button className="button-secondary" onClick={() => copyValue(item.command, item.id)} type="button">
                      {copied === item.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="panel section-panel">
              <div className="eyebrow">Supported sources</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>Current ingest adapters</h2>
              <div className="stack" style={{ marginTop: 18 }}>
                {CONNECTORS.map((item) => (
                  <div className="panel-muted card-pad" key={item.id}>
                    <strong>{item.name}</strong>
                    <p className="section-copy" style={{ marginBottom: 0 }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel section-panel">
              <div className="eyebrow">Privacy stance</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>What Burnlog does not upload</h2>
              <div className="info-grid" style={{ marginTop: 18 }}>
                <div className="panel-muted card-pad">
                  <strong>Never sent</strong>
                  <p className="section-copy">Prompt text, repo paths, filenames, project names, cwd, or source code.</p>
                </div>
                <div className="panel-muted card-pad">
                  <strong>Actually sent</strong>
                  <p className="section-copy">Token totals, model, provider, timestamp, source, and an opaque dedupe identifier.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

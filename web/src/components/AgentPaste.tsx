"use client";

import { useState } from "react";
import { ToolLogo } from "./ToolLogo";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * "Paste this into your agent."
 *
 * The install command asks someone to open a terminal, remember a package
 * name, and then read a wizard. Every person who would use burnlog already has
 * an agent sitting in front of them that can do all three. So the primary
 * onboarding is a prompt, not a command: they paste one block, their agent
 * fetches /agent-setup.md, and that file — which is written to be executed —
 * carries the real procedure, the consent step, and the privacy rules.
 *
 * The prompt is deliberately short. A long one invites the agent to summarise
 * it; a short one that points at a URL makes fetching the file the only way to
 * proceed, which is what keeps the instructions in one place we can update.
 *
 * Agents that write their usage to disk need nothing extra. The ones that
 * don't get one added line about `wrap`, because an agent that skips it will
 * cheerfully report "nothing found" and leave the user thinking burnlog is
 * broken.
 */

type Agent = {
  slug: string;
  name: string;
  /** "log" reads usage off disk; "wrap" has to be counted at the wire. */
  method: "log" | "wrap";
};

export const AGENTS: Agent[] = [
  { slug: "claude-code", name: "Claude Code", method: "log" },
  { slug: "codex", name: "Codex", method: "log" },
  { slug: "cursor", name: "Cursor", method: "wrap" },
  { slug: "copilot", name: "Copilot", method: "wrap" },
  { slug: "windsurf", name: "Windsurf", method: "wrap" },
  { slug: "gemini-cli", name: "Gemini CLI", method: "wrap" },
  { slug: "opencode", name: "opencode", method: "wrap" },
  { slug: "aider", name: "aider", method: "wrap" },
];

const BASE = `Set up burnlog for me — the public leaderboard for AI coding token usage.

Fetch https://burnlog.net/agent-setup.md and follow it top to bottom. It is written to be executed, not summarised.

Rules: show me my own totals before any account exists, ask me before anything is published, and never upload prompts, code, file names, or repo names — token counts only.`;

export function promptFor(agent: Agent): string {
  if (agent.method === "log") {
    return `${BASE}\n\nI use ${agent.name}, which writes its own usage log, so the plain sync path covers it.`;
  }
  return `${BASE}\n\nI use ${agent.name}, which keeps no usage log of its own — count it with \`burnlog wrap\` as that file describes.`;
}

export function AgentPaste({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(AGENTS[0]);
  const [copied, setCopied] = useState(false);
  const prompt = promptFor(active);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the prompt is on screen and selectable.
    }
  }

  return (
    <div
      style={{
        border: "1px solid #27272A",
        borderRadius: 12,
        background: "#0C0C0E",
        overflow: "hidden",
      }}
    >
      {/* Agent picker. The icons are the point: people recognise their tool
          before they read a word, and seeing it listed answers "does this work
          with mine" without a click. */}
      <div
        role="tablist"
        aria-label="Your coding agent"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: 10,
          borderBottom: "1px solid #18181B",
        }}
      >
        {AGENTS.map((a) => {
          const on = a.slug === active.slug;
          return (
            <button
              key={a.slug}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(a)}
              title={a.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                flexShrink: 0,
                minHeight: 36,
                padding: "7px 11px",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                whiteSpace: "nowrap",
                border: `1px solid ${on ? "#D9770655" : "#1C1C1F"}`,
                background: on ? "#D9770614" : "transparent",
                color: on ? "#FAFAFA" : "#71717A",
              }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 15, height: 15, opacity: on ? 1 : 0.65 }}>
                <ToolLogo slug={a.slug} size={15} wordmark={false} />
              </span>
              {a.name}
            </button>
          );
        })}
      </div>

      <div style={{ padding: compact ? 14 : 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#52525B",
            }}
          >
            paste into {active.name}
          </span>
          <button
            onClick={copy}
            style={{
              marginLeft: "auto",
              minHeight: 36,
              padding: "8px 14px",
              borderRadius: 7,
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              border: `1px solid ${copied ? "#10B98155" : "#D9770655"}`,
              background: copied ? "#10B98114" : "#D9770618",
              color: copied ? "#10B981" : "#D97706",
            }}
          >
            {copied ? "✓ copied" : "Copy prompt"}
          </button>
        </div>

        <pre
          style={{
            margin: 0,
            padding: compact ? 12 : 15,
            background: "#09090B",
            border: "1px solid #18181B",
            borderRadius: 8,
            fontFamily: MONO,
            fontSize: compact ? 11.5 : 12.5,
            lineHeight: 1.7,
            color: "#D4D4D8",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: compact ? 210 : undefined,
            overflow: "auto",
          }}
        >
          {prompt}
        </pre>

        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 12,
            flexWrap: "wrap",
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#3F3F46",
          }}
        >
          <span>your agent asks before it publishes anything</span>
          <a href="/agent-setup.md" style={{ color: "#52525B", textDecoration: "none", marginLeft: "auto" }}>
            read what it will run →
          </a>
        </div>
      </div>
    </div>
  );
}

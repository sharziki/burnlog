"use client";

import { useState } from "react";
import { AGENTS, promptFor } from "./AgentPaste";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * The whole onboarding in one button: copy the Claude Code prompt, paste it
 * into the agent, and the agent installs, signs in, and syncs. Every other
 * agent gets the tabbed version on /agent.
 */
export function CopyPrompt() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(promptFor(AGENTS[0]));
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // Clipboard blocked (http, old Safari): /agent has the prompt as text.
      window.location.href = "/agent";
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "13px 20px",
        background: "#D97706",
        color: "#09090B",
        border: "none",
        borderRadius: 8,
        fontFamily: MONO,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {copied ? "✓ Copied — paste it into Claude Code" : "Copy prompt for Claude Code"}
    </button>
  );
}

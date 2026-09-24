"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { AgentRow } from "@/components/AgentRow";

function promptFor(code: string | null): string {
  const cmd = code
    ? `npx -y @sxnalabs/burnlog@latest connect ${code}`
    : "npx -y @sxnalabs/burnlog@latest connect";
  return `Connect this machine to my burnlog account (burnlog.net — the public leaderboard for AI coding token usage).

Run this one command and show me its output:

${cmd}

It reads token counts from every coding agent on this machine — never prompts, code, or file names — uploads them to my account, and turns on auto-sync.${
    code ? " The code is single-use and expires in 30 minutes." : " It opens a browser once for GitHub sign-in."
  } Then tell me my rank and my profile link.`;
}

async function freshPrompt(): Promise<string> {
  try {
    const res = await fetch("/api/connect", { method: "POST" });
    if (res.ok) return promptFor(((await res.json()) as { code: string }).code);
  } catch {
    // The prompt still works without a code, via browser sign-in.
  }
  return promptFor(null);
}

/** Always ready: the CLI handles GitHub sign-in when a code is unavailable. */
export function SetupCTA() {
  return (
    <div className="flex flex-col items-start gap-3">
      <CopyButton getValue={freshPrompt} label="Copy setup prompt" copiedLabel="Copied" />
      <AgentRow getPrompt={freshPrompt} />
    </div>
  );
}

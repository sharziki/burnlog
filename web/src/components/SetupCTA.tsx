"use client";

import { GithubIcon } from "@/components/ui/github-icon";
import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { GlowButton } from "@/components/ui/glow-button";
import { useMe } from "@/hooks/useMe";
import { signInWithGitHub } from "@/app/actions";

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

/**
 * The whole onboarding. Signed in: one click copies a prompt carrying a
 * single-use code, so the agent's one command links straight to this account.
 * Signed out: sign in first (one click), then copy.
 */
export function SetupCTA() {
  const me = useMe();
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">("idle");

  async function copy() {
    setState("working");
    let code: string | null = null;
    try {
      const res = await fetch("/api/connect", { method: "POST" });
      if (res.ok) code = ((await res.json()) as { code: string }).code;
    } catch {
      // No code: the prompt still works, via browser sign-in.
    }
    try {
      await navigator.clipboard.writeText(promptFor(code));
      setState("copied");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("error");
    }
  }

  if (me === undefined) {
    return <div className="h-[52px]" aria-hidden />;
  }

  if (!me) {
    return (
      <div className="flex flex-col items-center gap-4">
        <form action={signInWithGitHub}>
          <GlowButton type="submit">
            <GithubIcon className="size-4" aria-hidden /> Sign in with GitHub
          </GlowButton>
        </form>
        <p className="m-0 font-mono text-xs text-dim">
          then copy one prompt into your coding agent · that&apos;s the whole setup
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <GlowButton type="button" onClick={copy} disabled={state === "working"}>
        {state === "copied" ? (
          <>
            <Check className="size-4 text-amber" aria-hidden /> Copied — paste it into your agent
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden /> {state === "working" ? "Preparing…" : "Copy setup prompt"}
          </>
        )}
      </GlowButton>
      <p className="m-0 flex items-center gap-2 font-mono text-xs text-dim">
        <Terminal className="size-3.5" aria-hidden />
        {state === "error"
          ? "Clipboard blocked — allow it and try again."
          : "works in Claude Code, Codex, Cursor, Gemini, Copilot and 50 more"}
      </p>
    </div>
  );
}

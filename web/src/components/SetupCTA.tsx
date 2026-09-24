"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { GithubIcon } from "@/components/ui/github-icon";
import { useMe } from "@/hooks/useMe";
import { Skeleton } from "@/components/ui/skeleton";
import { signInWithGitHub } from "@/app/actions";
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

/** Signed out: one click to sign in. Signed in: one click to copy the prompt. */
export function SetupCTA() {
  const me = useMe();

  if (me === undefined) return <Skeleton className="h-11 w-[26rem] max-w-full rounded-lg" />;

  if (!me) {
    return (
      <div className="flex flex-col items-start gap-3">
        <form action={signInWithGitHub}>
          <button
            type="submit"
            className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-accent px-5 text-[14px] font-medium text-bg transition-[filter] hover:brightness-110"
          >
            <GithubIcon className="size-4" /> Sign in with GitHub
          </button>
        </form>
        <AgentRow />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <CopyButton getValue={freshPrompt} label="Copy setup prompt" copiedLabel="Copied" />
      <AgentRow getPrompt={freshPrompt} />
    </div>
  );
}

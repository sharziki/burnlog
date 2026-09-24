import type { Metadata } from "next";
import { SetupCTA } from "@/components/SetupCTA";

export const metadata: Metadata = {
  title: "Set up burnlog from your coding agent",
  description:
    "One prompt, pasted into any coding agent — Claude Code, Codex, Cursor, Gemini CLI, Copilot and 50 more. It links the machine to your burnlog account, counts every token you've burned, and puts you on the leaderboard.",
  alternates: { canonical: "/agent" },
};

const STEPS = [
  ["Sign in", "One click with GitHub. That's your account and your place on the board."],
  ["Copy the prompt", "It carries a one-time code for your account, good for 30 minutes."],
  ["Paste it into your agent", "It runs one command: links this machine, uploads every agent's history, turns on auto-sync."],
] as const;

/** The link you send someone who asks "how do I get on this thing". */
export default function AgentPage() {
  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_50%_60%_at_50%_-10%,rgba(245,158,11,0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-20 text-center">
        <h1 className="animate-rise m-0 text-4xl font-bold tracking-tighter text-ink sm:text-6xl">
          One paste. <span className="bg-linear-to-r from-amber to-flame bg-clip-text text-transparent">That&apos;s setup.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-soft">
          Works in any coding agent — Claude Code, Codex, Cursor, Gemini CLI, Copilot, opencode, pi, Amp and 50 more.
          Token counts only, never prompts, code, or file names.
        </p>
        <div className="mt-10">
          <SetupCTA />
        </div>
        <ol className="m-0 mt-16 grid list-none gap-3 p-0 text-left sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line bg-surface/80 p-5">
              <div className="font-mono text-xs text-amber">0{i + 1}</div>
              <div className="mt-2 font-semibold text-ink">{title}</div>
              <p className="m-0 mt-1.5 text-sm leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 font-mono text-xs text-dim">
          Prefer a terminal? <code className="text-soft">npx @sxnalabs/burnlog connect</code>
        </p>
      </div>
    </main>
  );
}

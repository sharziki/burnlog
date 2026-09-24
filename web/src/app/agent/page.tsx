import type { Metadata } from "next";
import { SetupCTA } from "@/components/SetupCTA";

export const metadata: Metadata = {
  title: "Set up burnlog from your coding agent",
  description:
    "One prompt, pasted into any coding agent — Claude Code, Codex, Cursor, Gemini CLI, Copilot and 50 more. It links the machine to your burnlog account, counts every token you've burned, and puts you on the leaderboard.",
  alternates: { canonical: "/agent" },
};

const STEPS = [
  ["Copy the prompt", "If you're signed in, it includes a one-time code. Otherwise the setup opens GitHub sign-in."],
  ["Paste it into your agent", "It runs one command that links this machine and uploads token counts."],
  ["See your profile", "Your agent turns on auto-sync and gives you a profile link."],
] as const;

/** The link you send someone who asks "how do I get on this thing". */
export default function AgentPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-28 pt-16 sm:px-8 sm:pt-24">
      <h1 className="m-0 font-display text-[48px] leading-none text-ink sm:text-[60px]">
        One paste. That&apos;s setup.
      </h1>
      <p className="m-0 mt-6 max-w-[30rem] text-[16px] leading-relaxed text-soft">
        Works in any coding agent — Claude Code, Codex, Cursor, Gemini CLI, Copilot, opencode, pi, Amp and 50 more.
        Token counts only, never prompts, code, or file names.
      </p>
      <div className="mt-9">
        <SetupCTA />
      </div>

      <ol className="m-0 mt-16 list-none border-t border-line p-0">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-line py-6">
            <span className="font-mono text-[13px] text-dim">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="block text-[15px] text-ink">{title}</span>
              <span className="mt-1 block text-[14px] leading-relaxed text-soft">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="m-0 mt-8 text-[13px] text-dim">
        Prefer a terminal? <code className="font-mono text-soft">npx @sxnalabs/burnlog connect</code>
      </p>
    </main>
  );
}

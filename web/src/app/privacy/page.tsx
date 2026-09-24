import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "What burnlog stores, and what it never touches",
  description:
    "The full field list. burnlog stores token counts, model, agent, an opaque id and a timestamp — never prompts, completions, file names, repo names, or paths.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Privacy"
      title={<>Your prompts don&apos;t leave your machine.</>}
      intro={
        <p className="m-0">
          burnlog is a leaderboard for how many tokens you burn through AI coding
          agents. It is not an analytics tool for what you build with them.
        </p>
      }
    >
      <h2>What the CLI reads</h2>
      <p>
        The <code>burnlog</code> CLI reads local
        log files written by your coding agents — e.g.{" "}
        <code>~/.claude/projects/*/*.jsonl</code>{" "}
        for Claude Code,{" "}
        <code>~/.codex/sessions/**/*.jsonl</code>{" "}
        for OpenAI Codex. These files contain token usage alongside prompts,
        tool calls, and file contents.
      </p>
      <p>
        The CLI extracts <em>only</em> the token-usage numbers and a random
        request id (for dedup). Everything else — prompt text, filenames,
        working directory, session ids, tool output — is discarded locally
        and never transmitted.
      </p>

      <h2>What the server stores</h2>
      <p>Per burn event, we store exactly these fields:</p>
      <ul>
        <li>
          <code>requestId</code> — a random
          opaque id used only to detect duplicate uploads.
        </li>
        <li>
          <code>source</code> — which CLI
          (<code>claude-code</code>, <code>codex</code>, …).
        </li>
        <li>
          <code>model</code>,{" "}
          <code>provider</code> — e.g.{" "}
          <code>claude-opus-4-7</code>, <code>anthropic</code>.
        </li>
        <li>
          <code>inputTokens</code>,{" "}
          <code>outputTokens</code>,{" "}
          <code>cacheCreationTokens</code>,{" "}
          <code>cacheReadTokens</code>,{" "}
          <code>totalTokens</code>.
        </li>
        <li>
          <code>timestamp</code> — when the
          model call happened.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> store: prompts, responses, file paths,
        project or repo names, working directory, session ids, tool outputs,
        or any content produced during your agent session.
      </p>
      <p>
        The source-of-truth is the Prisma schema at{" "}
        <code>
          web/prisma/schema.prisma
        </code>{" "}
        in the public repo. If you can read it, you can audit it.
      </p>

      <h2>Account data</h2>
      <p>
        Signing in uses GitHub OAuth. We receive your GitHub username,
        display name, avatar URL, email (if public), and bio. We use these to
        show your profile on the leaderboard. You can delete your account at
        any time from settings; this cascades and permanently removes every
        burn event we&apos;ve recorded for you.
      </p>

      <h2>Cookies & analytics</h2>
      <p>
        We set a session cookie to keep you logged in. We don&apos;t run
        third-party analytics, pixels, or ad trackers. If we add a
        self-hosted analytics tool in the future, we&apos;ll list it here
        before turning it on.
      </p>

      <h2>Self-hosting</h2>
      <p>
        burnlog is open source (MIT). You can self-host the entire stack —
        web + Postgres — and keep the data on your own machine. Point the
        CLI at your instance with{" "}
        <code>BURNLOG_API_URL</code>.
      </p>

      <h2>Contact</h2>
      <p>
        burnlog is operated by Sharvil Saxena / SXNA Labs. For privacy
        questions, email{" "}
        <a href="mailto:sharvil@sxnalabs.com">
          sharvil@sxnalabs.com
        </a>
        .
      </p>

      <p className="mt-12 font-mono text-[12px] text-faint">
        Last updated: 2026-04-22
      </p>
    </DocPage>
  );
}

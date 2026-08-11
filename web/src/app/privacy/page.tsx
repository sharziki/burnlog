import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "privacy",
  description:
    "burnlog's privacy model — what we store, what we don't, and why.",
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "64px 24px",
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        color: "#E4E4E7",
        lineHeight: 1.7,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6B7280",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: MONO,
        }}
      >
        burnlog · privacy
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 32px", color: "#fff" }}>
        Your prompts don&apos;t leave your machine.
      </h1>

      <p style={{ color: "#A1A1AA" }}>
        burnlog is a leaderboard for how many tokens you burn through AI coding
        agents. It is not an analytics tool for what you build with them. That
        distinction is load-bearing, and it shapes the entire schema.
      </p>

      <Section title="What the CLI reads">
        <p>
          The <code style={{ color: "#D97706" }}>burnlog</code> CLI reads local
          log files written by your coding agents — e.g.{" "}
          <code style={{ color: "#D97706" }}>~/.claude/projects/*/*.jsonl</code>{" "}
          for Claude Code,{" "}
          <code style={{ color: "#D97706" }}>~/.codex/sessions/**/*.jsonl</code>{" "}
          for OpenAI Codex. These files contain token usage alongside prompts,
          tool calls, and file contents.
        </p>
        <p>
          The CLI extracts <em>only</em> the token-usage numbers and a random
          request id (for dedup). Everything else — prompt text, filenames,
          working directory, session ids, tool output — is discarded locally
          and never transmitted.
        </p>
      </Section>

      <Section title="What the server stores">
        <p>Per burn event, we store exactly these fields:</p>
        <ul style={{ color: "#A1A1AA", paddingLeft: 20 }}>
          <li>
            <code style={{ color: "#D97706" }}>requestId</code> — a random
            opaque id used only to detect duplicate uploads.
          </li>
          <li>
            <code style={{ color: "#D97706" }}>source</code> — which CLI
            (<code>claude-code</code>, <code>codex</code>, …).
          </li>
          <li>
            <code style={{ color: "#D97706" }}>model</code>,{" "}
            <code style={{ color: "#D97706" }}>provider</code> — e.g.{" "}
            <code>claude-opus-4-7</code>, <code>anthropic</code>.
          </li>
          <li>
            <code style={{ color: "#D97706" }}>inputTokens</code>,{" "}
            <code style={{ color: "#D97706" }}>outputTokens</code>,{" "}
            <code style={{ color: "#D97706" }}>cacheCreationTokens</code>,{" "}
            <code style={{ color: "#D97706" }}>cacheReadTokens</code>,{" "}
            <code style={{ color: "#D97706" }}>totalTokens</code>.
          </li>
          <li>
            <code style={{ color: "#D97706" }}>timestamp</code> — when the
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
          <code style={{ color: "#D97706" }}>
            web/prisma/schema.prisma
          </code>{" "}
          in the public repo. If you can read it, you can audit it.
        </p>
      </Section>

      <Section title="Account data">
        <p>
          Signing in uses GitHub OAuth. We receive your GitHub username,
          display name, avatar URL, email (if public), and bio. We use these to
          show your profile on the leaderboard. You can delete your account at
          any time from settings; this cascades and permanently removes every
          burn event we&apos;ve recorded for you.
        </p>
      </Section>

      <Section title="Cookies & analytics">
        <p>
          We set a session cookie to keep you logged in. We don&apos;t run
          third-party analytics, pixels, or ad trackers. If we add a
          self-hosted analytics tool in the future, we&apos;ll list it here
          before turning it on.
        </p>
      </Section>

      <Section title="Self-hosting">
        <p>
          burnlog is open source (MIT). You can self-host the entire stack —
          web + Postgres — and keep the data on your own machine. Point the
          CLI at your instance with{" "}
          <code style={{ color: "#D97706" }}>BURNLOG_API_URL</code>.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          burnlog is operated by Sharvil Saxena / SXNA Labs. For privacy
          questions, email{" "}
          <a href="mailto:sharvil@sxnalabs.com" style={{ color: "#D97706" }}>
            sharvil@sxnalabs.com
          </a>
          .
        </p>
      </Section>

      <p style={{ color: "#52525B", fontSize: 12, marginTop: 48, fontFamily: MONO }}>
        Last updated: 2026-04-22
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontSize: 11,
          color: "#6B7280",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: MONO,
          marginBottom: 10,
        }}
      >
        {title}
      </h2>
      <div style={{ color: "#A1A1AA" }}>{children}</div>
    </section>
  );
}

import type { Metadata } from "next";
import { AgentPaste } from "@/components/AgentPaste";

export const metadata: Metadata = {
  title: "Set up burnlog from your coding agent",
  description:
    "One prompt, pasted into Claude Code, Codex, Cursor, Copilot, Windsurf, Gemini CLI, opencode, or aider. Your agent installs burnlog, counts the tokens it burns, and puts you on the public leaderboard.",
  alternates: { canonical: "/agent" },
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

/**
 * The page you send someone when they ask "how do I get on this thing".
 *
 * It exists as its own URL rather than only as a landing-page section because
 * that link is what gets pasted into a group chat, and a link that lands on a
 * marketing page and asks you to scroll loses most of the people who clicked.
 */
export default function AgentPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 72px", fontFamily: SANS }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "#D97706",
        }}
      >
        setup, delegated
      </div>

      <h1
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: -1.5,
          lineHeight: 1.08,
          color: "#FAFAFA",
          margin: "14px 0 0",
        }}
      >
        Let your agent put you
        <br />
        on the leaderboard.
      </h1>

      <p style={{ color: "#71717A", fontSize: 15, lineHeight: 1.65, margin: "16px 0 0", maxWidth: 580 }}>
        Copy the prompt, paste it into whatever you code with, and it does the rest:
        finds your agents, reads the token counts already on your disk, shows you the
        numbers, and only then offers to sign you in.
      </p>

      <div style={{ marginTop: 26 }}>
        <AgentPaste />
      </div>

      <section style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 13, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase", color: "#D97706", margin: 0 }}>
          What your agent will do
        </h2>
        <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 1 }}>
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              style={{
                display: "flex",
                gap: 14,
                padding: "13px 0",
                borderTop: i === 0 ? "none" : "1px solid #131316",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#D97706", width: 16, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: "#FAFAFA", fontSize: 14, fontWeight: 600 }}>{s.title}</span>
                <span style={{ display: "block", color: "#71717A", fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
                  {s.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ marginTop: 40, border: "1px solid #18181B", borderRadius: 10, background: "#0C0C0E", padding: 18 }}>
        <h2 style={{ fontSize: 13, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase", color: "#52525B", margin: 0 }}>
          Rather do it yourself
        </h2>
        <p style={{ color: "#71717A", fontSize: 13, lineHeight: 1.65, margin: "10px 0 12px" }}>
          The prompt is a convenience, not a requirement. The same setup is one command:
        </p>
        <code style={{ display: "block", fontFamily: MONO, fontSize: 12.5, color: "#E4E4E7", background: "#09090B", border: "1px solid #18181B", borderRadius: 7, padding: "10px 13px" }}>
          <span style={{ color: "#3F3F46" }}>$ </span>npx @sxnalabs/burnlog
        </code>
        <p style={{ color: "#3F3F46", fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, margin: "12px 0 0" }}>
          the instructions your agent follows:{" "}
          <a href="/agent-setup.md" style={{ color: "#52525B", textDecoration: "none" }}>
            /agent-setup.md
          </a>{" "}
          · what is stored:{" "}
          <a href="/privacy" style={{ color: "#52525B", textDecoration: "none" }}>
            /privacy
          </a>{" "}
          · per-agent detail:{" "}
          <a href="/tools" style={{ color: "#52525B", textDecoration: "none" }}>
            /tools
          </a>
        </p>
      </section>
    </main>
  );
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Read what's already on your disk",
    body:
      "Claude Code and Codex write their own session logs. Your first sync counts history you accumulated before you had heard of burnlog — nothing to set up retroactively.",
  },
  {
    title: "Show you the number before asking for anything",
    body:
      "The scan runs signed out and uploads nothing. The agent is instructed to report your totals back to you first, because an account you agreed to after seeing the number is a different decision from one you agreed to before.",
  },
  {
    title: "Hand you the GitHub sign-in",
    body:
      "It opens the browser and steps back. The instructions forbid it from automating the login or touching your credentials; with no browser available it tells you to run the login yourself.",
  },
  {
    title: "Install the session-end hook",
    body:
      "So every future session syncs itself. It tells you which config file it changed rather than editing it quietly.",
  },
  {
    title: "Cover the agents with no usage log",
    body:
      "Cursor on your own key, Gemini CLI, aider, opencode, your own scripts: burnlog runs them under a loopback proxy and reads the provider's own usage field. No certificate to install, and the request body is never inspected.",
  },
];

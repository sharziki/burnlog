"use client";

import { useState } from "react";
import { RANKS } from "@/lib/ranks";
import { FAQ } from "@/lib/faq";
import { formatTokens } from "@/lib/format";
import { AgentPaste } from "./AgentPaste";

/**
 * The logged-out landing page.
 *
 * Kept out of Burnlog.tsx deliberately: that component is the *product*
 * (leaderboard, clubs, h2h) and is already large. Marketing copy and product
 * chrome change for different reasons and shouldn't share a file.
 */

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

const INSTALL = "npx @sxnalabs/burnlog";

export type LandingStats = {
  totalBurned: number;
  weeklyTotal: number;
  activeUsers: number;
};

/**
 * The logged-out page, split in two around the leaderboard.
 *
 * The board *is* the product, and it used to sit below eight marketing
 * sections — nearly five thousand pixels down, reachable only by an anchor
 * link that asked people to take the pitch on faith first. So the pitch is now
 * one screen (`LandingHero`), the board comes next, and the material that
 * answers "should I install this" (`LandingRest`) sits under the thing it is
 * describing, where someone who has already seen the board will read it.
 *
 * What was cut rather than moved: a "Competition" section whose two cards
 * restated the rank ladder already in the hero and one line of achievements; a
 * standalone badge section; and a closing CTA that repeated the hero's two
 * buttons verbatim. None of them told a visitor anything the remaining page
 * doesn't.
 */
export function LandingHero({
  stats,
  signInAction,
}: {
  stats: LandingStats;
  signInAction?: () => Promise<void>;
}) {
  return (
    <div style={{ fontFamily: SANS }}>
      <Hero stats={stats} signInAction={signInAction} />
    </div>
  );
}

export function LandingRest({
  full = true,
}: {
  /** False on a core deployment — see lib/surface.ts. The landing page must
      not advertise a feature whose page is hidden. */
  full?: boolean;
}) {
  return (
    <div style={{ fontFamily: SANS }}>
      <PasteIntoAgent />
      <HowItWorks full={full} />
      <WhatItCounts />
      <Faq />
    </div>
  );
}

/* ---------------------------------------------------------------- hero --- */

function Hero({
  stats,
  signInAction,
}: {
  stats: LandingStats;
  signInAction?: () => Promise<void>;
}) {
  return (
    <section style={{ position: "relative", padding: "72px 0 24px", overflow: "hidden" }}>
      <Embers />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(300px,0.85fr)", gap: 56, alignItems: "center" }} className="landing-hero">
        <div>
          <div style={{ ...eyebrow, marginBottom: 20 }}>The leaderboard for the inference age</div>

          <h1 style={{ fontSize: 60, fontWeight: 800, letterSpacing: -2.4, lineHeight: 1.02, color: "#FAFAFA", margin: 0 }}>
            See how hard you
            <br />
            ship with AI.
          </h1>

          {/* The H1 is the line people remember; this H2 is the line people
              search for. Both are real copy — neither is here for the crawler
              alone. */}
          <h2 style={{ fontSize: 17, fontWeight: 400, color: "#A1A1AA", lineHeight: 1.65, margin: "22px 0 0", maxWidth: 500 }}>
            The public leaderboard for AI coding token usage. Every token your agents
            burn — Claude Code, Codex, Cursor, your own — counted, ranked, and put on a
            board against everyone else plugged in.
          </h2>

          <div style={{ marginTop: 30 }}>
            <InstallLine />
          </div>

          {/* The terminal is not where most people are sitting. The agent in
              front of them can run the whole setup, so that route gets a line
              of its own rather than a footnote further down the page. */}
          <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11.5, color: "#52525B" }}>
            no terminal handy?{" "}
            <a href="#agent" style={{ color: "#D97706", textDecoration: "none" }}>
              paste one prompt into your agent →
            </a>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
            {signInAction && (
              <form action={signInAction}>
                <button type="submit" className="btn-primary" style={primaryBtn}>
                  <GitHubGlyph />
                  Sign in with GitHub
                </button>
              </form>
            )}
            <a href="#leaderboard" style={ghostBtn}>
              See the board
            </a>
          </div>

          <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 11, color: "#3F3F46" }}>
            free · open-source CLI · no card · tokens only
          </div>
        </div>

        <RankLadder stats={stats} />
      </div>

    </section>
  );
}

function RankLadder({ stats }: { stats: LandingStats }) {
  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={eyebrow}>the ranks</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#3F3F46" }}>climb ↑</span>
      </div>
      {[...RANKS].reverse().map((r, i) => (
        <div
          key={r.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 0",
            borderTop: i === 0 ? "none" : "1px solid #141416",
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 17, color: r.color, width: 22, textAlign: "center" }}>
            {r.icon}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E4E4E7", flex: 1 }}>{r.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#52525B" }}>
            {r.min === 0 ? "0" : formatTokens(r.min) + "+"}
          </span>
        </div>
      ))}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #18181B", fontFamily: MONO, fontSize: 11, color: "#52525B", textAlign: "center" }}>
        {RANKS.length} ranks · nobody has reached{" "}
        <span style={{ color: "#FDE68A", fontWeight: 700 }}>{RANKS[RANKS.length - 1].name}</span> yet
      </div>
    </div>
  );
}

/* ------------------------------------------------------- compatibility --- */

/**
 * Named explicitly, because "does it work with my thing" is the first question.
 *
 * Split by mechanism, and the split is load-bearing: only these three write a
 * usage log burnlog can read. The previous list put Cursor, Copilot and Cline
 * under "read from local logs", which was simply not true — there is no adapter
 * for any of them, and there can't be until they write usage somewhere. They
 * are counted, but through `wrap`, and saying so is the difference between a
 * compatibility list and a wish list.
 */
const LOG_TOOLS = ["Claude Code", "Codex", "opencode", "Hermes"];

/** Anything that reads the standard base-URL variables, which is nearly everything. */
const WRAP_TOOLS = ["Cursor", "Gemini CLI", "aider", "Cline", "your own agents"];

const PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "Google",
  "Mistral",
  "Cohere",
  "OpenRouter",
  "Groq",
  "xAI",
  "DeepSeek",
  "Together",
  "Fireworks",
  "Perplexity",
  "Cerebras",
  "Ollama",
];

/**
 * Compatibility and privacy in one section.
 *
 * They were two, and they answer the same question from opposite ends — "will
 * it see my thing" and "what does it keep once it has" — so a visitor read the
 * same subject twice, four cards apart. Together they are one honest answer.
 */
function WhatItCounts() {
  return (
    <Section eyebrowText="what it counts" title="If it burns tokens, burnlog counts it.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }} className="landing-two">
        <div style={{ ...card, padding: 24 }}>
          <div style={{ ...eyebrow, marginBottom: 14 }}>agents — read from local logs</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {LOG_TOOLS.map((t) => (
              <span key={t} style={chip}>
                {t}
              </span>
            ))}
          </div>
          <p style={bodyText}>
            These write their own usage to disk, so burnlog reads it straight off — no
            key, no proxy, and your first run counts the history you already have.
          </p>
        </div>

        <div style={{ ...card, padding: 24 }}>
          <div style={{ ...eyebrow, marginBottom: 14 }}>everything else — counted at the wire</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {WRAP_TOOLS.map((t) => (
              <span key={t} style={chip}>
                {t}
              </span>
            ))}
          </div>
          <p style={bodyText}>
            No usage log to read, so these run under{" "}
            <code style={inlineCode}>burnlog wrap</code>, which counts calls no log file
            ever sees across {PROVIDERS.length} providers. No certificates, no HTTPS
            interception.{" "}
            <a href="/tools" style={linkText}>
              What each agent supports →
            </a>
          </p>
        </div>

        <div style={{ ...card, padding: 24, borderColor: "#14301F" }}>
          <div style={{ ...eyebrow, color: "#10B981", marginBottom: 14 }}>what we store</div>
          {["token counts", "model name", "which agent", "a random dedupe id", "a timestamp"].map((x) => (
            <Row key={x} mark="+" color="#10B981" text={x} />
          ))}
        </div>
        <div style={{ ...card, padding: 24, borderColor: "#3A1616" }}>
          <div style={{ ...eyebrow, color: "#EF4444", marginBottom: 14 }}>what we never touch</div>
          {["prompts or completions", "file names or contents", "project or repo names", "working directories", "session ids"].map((x) => (
            <Row key={x} mark={"\u2212"} color="#EF4444" text={x} />
          ))}
        </div>
      </div>
      <p style={{ ...bodyText, marginTop: 16 }}>
        The CLI is MIT-licensed and{" "}
        <a href="https://github.com/sharziki/burnlog" target="_blank" rel="noopener noreferrer" style={linkText}>
          open source
        </a>{" "}
        — read exactly what it sends before you run it. Or{" "}
        <a href="/privacy" style={linkText}>
          read the privacy model
        </a>
        .
      </p>
    </Section>
  );
}

function Row({ mark, color, text }: { mark: string; color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <span style={{ fontFamily: MONO, fontSize: 13, color, width: 12 }}>{mark}</span>
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#A1A1AA" }}>{text}</span>
    </div>
  );
}

/* -------------------------------------------------------- how it works --- */

/**
 * The zero-terminal path onto the board.
 *
 * It sits above HowItWorks because it *is* how it works for most visitors now:
 * the three-command explainer below answers "what will it actually do", which
 * is a second question, asked by fewer people.
 */
function PasteIntoAgent() {
  return (
    <div id="agent">
      <Section
        eyebrowText="no terminal required"
        title="Paste this into your agent. It handles the rest."
      >
        <p style={{ ...bodyText, margin: "-14px 0 20px", maxWidth: 600 }}>
          Your agent fetches the setup instructions, reads the token counts already
          sitting on your disk, shows you the number, and asks before anything is
          published.
        </p>
        <AgentPaste />
        <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 11, color: "#3F3F46" }}>
          <a href="/agent" style={{ color: "#52525B", textDecoration: "none" }}>
            burnlog.net/agent
          </a>{" "}
          — the shareable version of this block
        </div>
      </Section>
    </div>
  );
}

function HowItWorks({ full = true }: { full?: boolean }) {
  const steps = [
    {
      n: "01",
      title: "Run one command",
      code: INSTALL,
      body: "Finds your agents, signs you in, syncs. No config.",
    },
    {
      n: "02",
      title: "Catch everything else",
      code: "burnlog wrap -- <anything>",
      body: "Counts calls no log file ever sees.",
    },
    // Step three is the payoff, so it has to be a payoff that exists on this
    // deployment: challenges are staged, the board is not.
    full
      ? {
          n: "03",
          title: "Settle it",
          code: "burnlog challenge new",
          body: "Share one link and let the numbers argue.",
        }
      : {
          n: "03",
          title: "Climb",
          code: "burnlog sync",
          body: "Every sync moves you up the public board.",
        },
  ];
  return (
    <Section eyebrowText="setup" title="Sixty seconds, then never think about it again.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }} className="landing-three">
        {steps.map((s) => (
          <div key={s.n} style={{ ...card, padding: 24 }} className="hover-lift">
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#D97706", letterSpacing: 2, marginBottom: 12 }}>
              {s.n}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA", marginBottom: 12 }}>{s.title}</div>
            <div style={codeBlock}>
              <span style={{ color: "#3F3F46" }}>$ </span>
              {s.code}
            </div>
            <p style={{ ...bodyText, marginTop: 12 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- faq --- */

function Faq() {
  return (
    <Section eyebrowText="questions" title="What people ask before they install it.">
      <div style={{ display: "grid", gap: 10 }}>
        {FAQ.map(({ q, a }) => (
          // <details> rather than a state hook: it opens without JavaScript, so
          // the answer is in the HTML for a crawler and for anyone whose bundle
          // hasn't loaded yet.
          <details key={q} style={{ ...card, padding: "18px 22px" }}>
            <summary
              // The native disclosure marker is kept: it's the only thing that
              // tells you the row opens, and it flips when it does. Hiding it
              // costs more than the tidier line is worth.
              style={{
                cursor: "pointer",
                color: "#FAFAFA",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {q}
            </summary>
            <p style={{ ...bodyText, marginBottom: 0 }}>{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- parts --- */

function Section({
  eyebrowText,
  title,
  children,
}: {
  eyebrowText: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "56px 0", borderTop: "1px solid #131316" }}>
      <div style={eyebrow}>{eyebrowText}</div>
      <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.2, color: "#FAFAFA", margin: "12px 0 28px", maxWidth: 640, lineHeight: 1.12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function InstallLine() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the command is visible and selectable anyway.
    }
  }
  return (
    <button onClick={copy} className="hover-lift" aria-label={`Copy "${INSTALL}"`} style={installBtn}>
      <span style={{ color: "#3F3F46" }}>$</span>
      <span>{INSTALL}</span>
      <span style={{ marginLeft: 6, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: copied ? "#10B981" : "#52525B" }}>
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

/**
 * Deterministic positions — random offsets would differ between the server
 * and client render and trip a hydration mismatch.
 */
function Embers() {
  const sparks = [
    { left: "6%", bottom: 60, delay: "0s", duration: "7s" },
    { left: "17%", bottom: 180, delay: "1.4s", duration: "5.5s" },
    { left: "29%", bottom: 90, delay: "3.1s", duration: "6.4s" },
    { left: "44%", bottom: 240, delay: "2.2s", duration: "8s" },
    { left: "58%", bottom: 130, delay: "4.6s", duration: "6s" },
    { left: "71%", bottom: 200, delay: "0.8s", duration: "7.4s" },
    { left: "86%", bottom: 70, delay: "3.7s", duration: "5.8s" },
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {sparks.map((s, i) => (
        <span key={i} className="ember" style={{ left: s.left, bottom: s.bottom, animationDelay: s.delay, animationDuration: s.duration }} />
      ))}
    </div>
  );
}

function GitHubGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

/* -------------------------------------------------------------- tokens --- */

const card: React.CSSProperties = {
  background: "#0C0C0E",
  border: "1px solid #18181B",
  borderRadius: 14,
};

const eyebrow: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#D97706",
};

const bodyText: React.CSSProperties = {
  fontSize: 13.5,
  color: "#71717A",
  lineHeight: 1.65,
  margin: "12px 0 0",
};

const chip: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: "#A1A1AA",
  background: "#131316",
  border: "1px solid #1F1F23",
  borderRadius: 5,
  padding: "5px 9px",
};

const codeBlock: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11.5,
  color: "#D97706",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "9px 12px",
  overflowX: "auto",
  whiteSpace: "nowrap",
};

const inlineCode: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  color: "#D97706",
  background: "#131316",
  borderRadius: 4,
  padding: "1px 5px",
};

const linkText: React.CSSProperties = {
  color: "#D97706",
  textDecoration: "none",
  fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "13px 22px",
  background: "#D97706",
  color: "#09090B",
  border: "none",
  borderRadius: 8,
  fontFamily: MONO,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "13px 20px",
  border: "1px solid #27272A",
  borderRadius: 8,
  fontFamily: MONO,
  fontSize: 12.5,
  color: "#A1A1AA",
  textDecoration: "none",
};

const installBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "13px 16px",
  background: "#0C0C0E",
  border: "1px solid #27272A",
  borderRadius: 8,
  fontFamily: MONO,
  fontSize: 13,
  color: "#E4E4E7",
  cursor: "pointer",
  textAlign: "left",
};

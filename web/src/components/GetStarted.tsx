"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTokens } from "@/lib/format";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const INSTALL = "npx @sxnalabs/burnlog";

type Steps = {
  signedIn: boolean;
  synced: boolean;
  inChallenge: boolean;
};

/**
 * Getting-started checklist for a signed-in account that hasn't finished setup.
 *
 * Modelled on the pattern good dev tools converge on (Graphite, Clerk): a
 * numbered list that *detects* completion instead of asking you to tick it.
 * Step 2 is the one that matters — it polls while you're in your terminal, so
 * the moment your first tokens land the step ticks itself and the panel moves
 * on. Waiting for a webhook you have to go back and refresh for is what makes
 * setup feel like homework.
 *
 * It disappears for good once every step is done; there is no state to store
 * because every step is derived from real data.
 */
export function GetStarted({ username, full = true }: { username: string; full?: boolean }) {
  const [steps, setSteps] = useState<Steps | null>(null);
  const [tokens, setTokens] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/onboarding", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; steps?: Steps; tokens?: number };
      if (data.ok && data.steps) {
        setSteps(data.steps);
        setTokens(data.tokens ?? 0);
      }
    } catch {
      // A failed poll just means we try again.
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Poll only while there's something left to detect, and stop entirely once
  // the user is set up — a permanent background timer for a finished checklist
  // is pure waste.
  // Only the steps this deployment actually shows may hold the checklist open:
  // on a core deployment there is no challenge to join, so counting that step
  // would leave the panel up forever with nothing to click.
  const done = steps ? steps.synced && (!full || steps.inChallenge) : false;
  useEffect(() => {
    if (!steps || done) return;
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [steps, done, check]);

  if (!steps || done || dismissed) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the command is selectable.
    }
  }

  const items = [
    {
      done: steps.synced,
      title: steps.synced ? `Connected · ${formatTokens(tokens)} tokens` : "Connect this machine once",
      body: steps.synced ? null : (
        <>
          <p style={body}>
            You&apos;re signed in. Run this on the machine you code on. If it is already connected, skip it.
          </p>
          <button onClick={copy} style={cmd} aria-label={`Copy ${INSTALL}`}>
            <span style={{ color: "#3F3F46" }}>$</span> {INSTALL}
            <span style={{ marginLeft: 10, fontSize: 9, color: copied ? "#10B981" : "#52525B" }}>
              {copied ? "COPIED" : "COPY"}
            </span>
          </button>
          <p style={{ ...body, color: "#3F3F46", marginTop: 8 }}>
            <span style={{ color: "#D97706" }}>◌</span> waiting for your first tokens — this
            ticks itself
          </p>
          {/* Not everyone reading this has a terminal open; everyone reading it
              has an agent. */}
          <p style={{ ...body, marginTop: 6, fontSize: 11.5 }}>
            or{" "}
            <a href="/agent" style={{ color: "#D97706", textDecoration: "none" }}>
              paste a prompt into your agent
            </a>{" "}
            and let it run the setup.
          </p>
        </>
      ),
    },
    ...(full
      ? [
          {
            done: steps.inChallenge,
            title: "Start a challenge",
            body: steps.inChallenge ? null : (
              <>
                <p style={body}>Pick a format, share one link, settle it with real numbers.</p>
                <a href="/challenges" style={action}>
                  Browse challenges →
                </a>
              </>
            ),
          },
        ]
      : []),
  ];

  const complete = items.filter((i) => i.done).length;

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#FAFAFA", fontWeight: 700 }}>
          Get started
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#52525B" }}>
          {complete} of {items.length} done
        </span>
        <div style={{ flex: 1, height: 3, background: "#18181B", borderRadius: 2, maxWidth: 160 }}>
          <div
            style={{
              width: `${(complete / items.length) * 100}%`,
              height: "100%",
              background: "#D97706",
              borderRadius: 2,
              transition: "width .4s ease",
            }}
          />
        </div>
        <button onClick={() => setDismissed(true)} style={dismiss} aria-label="Hide setup">
          hide
        </button>
      </div>

      <div style={{ display: "grid", gap: 2 }}>
        {items.map((item, i) => (
          <div
            key={item.title}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 0",
              borderTop: i === 0 ? "none" : "1px solid #131316",
              opacity: item.done ? 0.55 : 1,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                width: 18,
                flexShrink: 0,
                color: item.done ? "#10B981" : "#D97706",
              }}
            >
              {item.done ? "✓" : i + 1}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13.5,
                  color: item.done ? "#71717A" : "#FAFAFA",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {item.title}
              </div>
              {item.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "#0C0C0E",
  border: "1px solid #D9770633",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

const body: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12.5,
  color: "#71717A",
  lineHeight: 1.6,
};

const cmd: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  marginTop: 10,
  padding: "9px 13px",
  background: "#09090B",
  border: "1px solid #27272A",
  borderRadius: 7,
  fontFamily: MONO,
  fontSize: 12.5,
  color: "#E4E4E7",
  cursor: "pointer",
};

const action: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 40,
  marginTop: 10,
  fontFamily: MONO,
  fontSize: 11,
  color: "#D97706",
  textDecoration: "none",
};

const dismiss: React.CSSProperties = {
  marginLeft: "auto",
  background: "transparent",
  border: "none",
  color: "#3F3F46",
  fontFamily: MONO,
  fontSize: 10,
  cursor: "pointer",
};

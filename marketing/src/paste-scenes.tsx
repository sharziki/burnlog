import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BurnMark } from "./BurnMark";
import { C, MONO, SANS } from "./brand";
import { Chip, CountUp, Eyebrow, Ground, Headline, Rise, Typed, valueAt } from "./parts";
import { RANKS } from "./ranks";
import { useLayout } from "./scenes";

/**
 * The paste film — the onboarding story the launch film predates.
 *
 * Structure follows what actually holds attention on a timeline: the hook is
 * the product doing its job, not a logo, and the "aha" (you did not install
 * anything — your agent did) lands inside the first four seconds. No beat sits
 * longer than about three seconds, because a single held screen reads as much
 * longer on video than it does in an editor.
 *
 * Every string here is real. The prompt is the one /agent serves, quoted to a
 * sentence boundary; the scan lines are a real `burnlog scan` run on this
 * machine. The brand system bans fake UI and fabricated usage, and a launch
 * video is exactly where that rule earns its keep.
 */

/* ------------------------------------------------------------ 1 · paste --- */

const PROMPT_L1 = "Set up burnlog for me — the public leaderboard for AI coding token usage.";
const PROMPT_L2 = "Fetch https://burnlog.net/agent-setup.md and follow it top to bottom.";

export const PasteBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();

  // The copy button is the physical act the whole film is about, so it gets a
  // real state change rather than sitting there as decoration.
  const copiedAt = Math.round(fps * 3.1);
  const copied = frame >= copiedAt;
  const pop = interpolate(frame - copiedAt, [0, 5, 10], [1, 1.06, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Ground>
      <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>no terminal required</Eyebrow>
        </Rise>
        <Rise delay={fps * 0.15} style={{ marginTop: 26 * k }}>
          <Headline size={92 * k}>
            You don&apos;t install it.
            <br />
            Your agent does.
          </Headline>
        </Rise>

        <Rise delay={fps * 0.45} style={{ marginTop: 46 * k }}>
          <div
            style={{
              width: col,
              boxSizing: "border-box",
              background: C.surface,
              border: `1px solid ${C.borderLoud}`,
              borderRadius: 18 * k,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14 * k,
                padding: `${20 * k}px ${28 * k}px`,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 19 * k,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.muted,
                }}
              >
                paste into claude code
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ display: "inline-block", transform: `scale(${pop})` }}>
                <Chip
                  size={20 * k}
                  color={copied ? C.success : C.signal}
                  bg={copied ? "rgba(16,185,129,0.10)" : "rgba(217,119,6,0.10)"}
                  border={copied ? "rgba(16,185,129,0.35)" : "rgba(217,119,6,0.35)"}
                >
                  {copied ? "✓ copied" : "Copy prompt"}
                </Chip>
              </span>
            </div>

            <div
              style={{
                padding: `${30 * k}px ${28 * k}px`,
                fontFamily: MONO,
                fontSize: 25 * k,
                lineHeight: 1.7,
                color: "#D4D4D8",
              }}
            >
              <div>
                <Typed text={PROMPT_L1} startAt={Math.round(fps * 0.7)} cps={44} holdCursor={false} />
              </div>
              <div style={{ height: 20 * k }} />
              <div style={{ color: C.secondary }}>
                <Typed text={PROMPT_L2} startAt={Math.round(fps * 2.05)} cps={46} />
              </div>
            </div>
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* ------------------------------------------------------------ 2 · works --- */

/**
 * What the agent then does, in its own order. These are the steps
 * /agent-setup.md instructs, and the two counts are a real scan on this
 * machine — 12,256 Claude Code events and 563 Codex events, 3.4B tokens.
 */
const AGENT_LINES: { text: string; color: string; at: number; bold?: boolean }[] = [
  { text: "→  fetching burnlog.net/agent-setup.md", color: C.secondary, at: 0.5 },
  { text: "→  npx @sxnalabs/burnlog scan", color: C.text, at: 1.1 },
  { text: "   ●  claude-code   12,256 events", color: C.success, at: 1.7 },
  { text: "   ●  codex            563 events", color: C.success, at: 2.0 },
  { text: "   ●  hermes           217 events", color: C.success, at: 2.3 },
  { text: "   3.4B tokens found — nothing uploaded yet", color: C.signalLight, at: 2.8, bold: true },
  { text: "→  asking you before publishing anything…", color: C.secondary, at: 3.6 },
  { text: "✓  signed in · synced · hook installed", color: C.success, at: 4.3, bold: true },
];

export const WorksBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();
  return (
    <Ground>
      <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>it reads what you already burned</Eyebrow>
        </Rise>
        <Rise delay={fps * 0.12} style={{ marginTop: 24 * k }}>
          <Headline size={80 * k}>Then it does the rest.</Headline>
        </Rise>

        <Rise delay={fps * 0.3} style={{ marginTop: 42 * k }}>
          <div
            style={{
              width: col,
              boxSizing: "border-box",
              background: C.surface,
              border: `1px solid ${C.borderLoud}`,
              borderRadius: 18 * k,
              padding: `${32 * k}px ${34 * k}px`,
              fontFamily: MONO,
              fontSize: 26 * k,
              lineHeight: 1.85,
              // Real CLI columns are aligned with spaces; HTML would collapse
              // them and turn the table back into prose.
              whiteSpace: "pre",
            }}
          >
            {AGENT_LINES.map((l, i) => {
              const at = Math.round(fps * l.at);
              const t = interpolate(frame - at, [0, 7], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: (x) => 1 - Math.pow(1 - x, 3),
              });
              return (
                <div
                  key={i}
                  style={{
                    color: l.color,
                    fontWeight: l.bold ? 700 : 400,
                    opacity: t,
                    transform: `translateX(${(1 - t) * -10}px)`,
                  }}
                >
                  {l.text}
                </div>
              );
            })}
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* ------------------------------------------------------------- 3 · rank --- */

const TARGET = 152_484_942_146; // sharziki's real all-time burn on the live board.

const rankFor = (n: number) => {
  const order = [...RANKS];
  let hit = order[0];
  for (const r of order) {
    const min = parseMin(r.min);
    if (n >= min) hit = r;
  }
  return hit;
};

const parseMin = (s: string): number => {
  if (s === "0") return 0;
  const unit = s.slice(-1);
  const v = parseFloat(s);
  return v * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[unit];
};

/**
 * The payoff: the number climbing and the rank badge changing under it.
 *
 * The counter is logarithmic (see CountUp) so the badge steps at a watchable
 * rate instead of jumping nine ranks in the last four frames.
 */
export const RankBeat: React.FC<{ climbSeconds?: number }> = ({ climbSeconds = 2.6 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad } = useLayout();

  const start = Math.round(fps * 0.35);
  const dur = Math.round(fps * climbSeconds);
  const t = interpolate(frame - start, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => 1 - Math.pow(1 - x, 3),
  });
  const rank = rankFor(valueAt(TARGET, t));

  return (
    <Ground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>and you&apos;re on the board</Eyebrow>
        </Rise>

        <Rise delay={fps * 0.15} style={{ marginTop: 40 * k, textAlign: "center" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 128 * k,
              fontWeight: 700,
              color: C.text,
              letterSpacing: -4 * k,
              lineHeight: 1,
            }}
          >
            <CountUp to={TARGET} startAt={start} durationInFrames={dur} />
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 22 * k,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: C.muted,
              marginTop: 18 * k,
            }}
          >
            tokens burned
          </div>
        </Rise>

        <Rise delay={fps * 0.35} style={{ marginTop: 44 * k }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18 * k,
              border: `1px solid ${C.borderLoud}`,
              background: C.surface,
              borderRadius: 14 * k,
              padding: `${18 * k}px ${30 * k}px`,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 44 * k, color: rank.color, lineHeight: 1 }}>
              {rank.icon}
            </span>
            <span style={{ fontFamily: SANS, fontSize: 42 * k, fontWeight: 700, color: C.text }}>
              {rank.name}
            </span>
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* -------------------------------------------------------------- 4 · cta --- */

export const PasteCta: React.FC = () => {
  const { fps } = useVideoConfig();
  const { k } = useLayout();
  return (
    <Ground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Rise distance={18}>
          <BurnMark size={88 * k} ground={C.canvas} gradientId="paste-cta" />
        </Rise>
        <Rise delay={fps * 0.18} style={{ marginTop: 34 * k, textAlign: "center" }}>
          <Headline size={78 * k}>One paste. That&apos;s the setup.</Headline>
        </Rise>
        <Rise delay={fps * 0.42} style={{ marginTop: 36 * k }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 36 * k,
              color: C.canvas,
              background: C.signal,
              fontWeight: 700,
              padding: `${20 * k}px ${38 * k}px`,
              borderRadius: 12 * k,
            }}
          >
            burnlog.net/agent
          </div>
        </Rise>
        <Rise delay={fps * 0.6} style={{ marginTop: 26 * k }}>
          <div style={{ fontFamily: MONO, fontSize: 21 * k, color: C.muted, letterSpacing: 1.5 }}>
            free · open-source CLI · tokens only
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

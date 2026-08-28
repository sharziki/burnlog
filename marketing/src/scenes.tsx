import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BurnMark } from "./BurnMark";
import { C, MONO, SANS } from "./brand";
import { Eyebrow, Ground, Headline, Rise, Typed } from "./parts";
import { RANKS } from "./ranks";

/**
 * One timeline, two aspect ratios. Everything sizes off the frame width so the
 * vertical cut is the same film rather than a second one to keep in step —
 * at 1080 wide the 1560px content column would otherwise simply overflow.
 */
const useLayout = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  // Scaling the vertical cut by width/1920 shrank everything to half size and
  // stranded it in the middle of a much taller frame. Type should fill the
  // measure it actually has, so portrait scales against a narrower reference
  // width instead of the landscape one.
  const k = width / (portrait ? 1150 : 1920);
  const pad = Math.round(120 * k);
  return { k, pad, col: Math.min(Math.round(1560 * k), width - 2 * pad) };
};

/* ------------------------------------------------------------ 1 · open --- */

export const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k } = useLayout();
  // The mark holds, then the lockup settles under it.
  const markScale = interpolate(frame, [0, fps * 0.7], [0.86, 1], {
    extrapolateRight: "clamp",
    easing: (x) => 1 - Math.pow(1 - x, 3),
  });
  return (
    <Ground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${markScale})` }}>
          <Rise distance={16}>
            <BurnMark size={132 * k} ground={C.canvas} gradientId="open" />
          </Rise>
        </div>
        <Rise delay={fps * 0.35} style={{ marginTop: 34, textAlign: "center" }}>
          <div style={{ fontFamily: SANS, fontSize: 76 * k, fontWeight: 700, color: C.text, letterSpacing: -2 * k }}>
            burnlog
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 19,
              letterSpacing: 7,
              textTransform: "uppercase",
              color: C.muted,
              marginTop: 12,
            }}
          >
            token burn tracker
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* ------------------------------------------------------------ 2 · hook --- */

export const Hook: React.FC = () => {
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();
  return (
    <Ground>
      <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>the inference age</Eyebrow>
        </Rise>
        <Rise delay={fps * 0.18} style={{ marginTop: 30 }}>
          <Headline size={104 * k}>
            Your agents burn
            <br />
            tokens all day.
          </Headline>
        </Rise>
        <Rise delay={fps * 0.5} style={{ marginTop: 30 }}>
          <div style={{ fontFamily: SANS, fontSize: 34, color: C.secondary, lineHeight: 1.5, maxWidth: 1180 }}>
            Nobody knows how many. Nobody knows who&apos;s ahead.
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* -------------------------------------------------------- 3 · terminal --- */

/**
 * Real output, not a mockup — these are the exact lines `burnlog` prints on a
 * first run, which is why the brand system's ban on fake UI is satisfied here.
 */
const TERMINAL_LINES: { text: string; color: string; delayS: number }[] = [
  { text: "  ▲  burnlog  ·  track the burn", color: C.text, delayS: 1.5 },
  { text: "", color: C.muted, delayS: 1.6 },
  { text: "  scanning for agents…", color: C.muted, delayS: 1.8 },
  { text: "  ●  claude-code       2.6M  40 calls", color: C.success, delayS: 2.5 },
  { text: "  ●  opencode          918K  22 calls", color: C.success, delayS: 2.8 },
  { text: "  ○  codex         not installed", color: C.faint, delayS: 3.0 },
  { text: "", color: C.muted, delayS: 3.1 },
  { text: "  found 3.5M tokens across 2 sources", color: C.signalLight, delayS: 3.4 },
];

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();
  return (
    <Ground>
      <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>setup</Eyebrow>
        </Rise>
        <Rise delay={fps * 0.15} style={{ marginTop: 26 }}>
          <Headline size={78 * k}>One command.</Headline>
        </Rise>

        <Rise delay={fps * 0.4} style={{ marginTop: 44 }}>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.borderLoud}`,
              borderRadius: 16,
              padding: `${34 * k}px ${40 * k}px`,
              fontFamily: MONO,
              fontSize: 30 * k,
              lineHeight: 1.75,
              // The CLI aligns its columns with spaces; HTML collapses runs of
              // them, which turned "claude-code       2.6M" into one space and
              // lost the table. This is real terminal output, so it keeps real
              // terminal spacing.
              whiteSpace: "pre",
              width: col,
              boxSizing: "border-box",
            }}
          >
            <div style={{ color: C.text }}>
              <span style={{ color: C.faint }}>$ </span>
              <Typed text="npx @sxnalabs/burnlog" startAt={Math.round(fps * 0.6)} />
            </div>
            {TERMINAL_LINES.map((l, i) => {
              const at = Math.round(fps * l.delayS);
              const o = interpolate(frame - at, [0, 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div key={i} style={{ color: l.color, opacity: o, minHeight: l.text ? undefined : 20 }}>
                  {l.text || " "}
                </div>
              );
            })}
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

/* ----------------------------------------------------------- 4 · climb --- */

export const Climb: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();
  const shown = [...RANKS].reverse();
  return (
    <Ground>
      <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
        <Rise>
          <Eyebrow>the ladder</Eyebrow>
        </Rise>
        <Rise delay={fps * 0.15} style={{ marginTop: 24 }}>
          <Headline size={78 * k}>Then you climb.</Headline>
        </Rise>

        <div style={{ marginTop: 40 * k, width: col }}>
          {shown.map((r, i) => {
            // Rows arrive bottom-up: the ladder is climbed, not listed.
            const at = Math.round(fps * (0.45 + (shown.length - 1 - i) * 0.075));
            const t = interpolate(frame - at, [0, 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: (x) => 1 - Math.pow(1 - x, 3),
            });
            return (
              <div
                key={r.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  padding: "11px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  opacity: t,
                  transform: `translateY(${(1 - t) * 18}px)`,
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 30 * k, color: r.color, width: 40 * k, textAlign: "center" }}>
                  {r.icon}
                </span>
                <span style={{ fontFamily: SANS, fontSize: 30 * k, fontWeight: 600, color: C.text, flex: 1 }}>
                  {r.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 24 * k, color: C.muted }}>
                  {r.min === "0" ? "0" : `${r.min}+`}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Ground>
  );
};

/* ------------------------------------------------------------- 5 · cta --- */

export const Cta: React.FC = () => {
  const { fps } = useVideoConfig();
  const { k } = useLayout();
  return (
    <Ground>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Rise distance={18}>
          <BurnMark size={92 * k} ground={C.canvas} gradientId="cta" />
        </Rise>
        <Rise delay={fps * 0.2} style={{ marginTop: 34, textAlign: "center" }}>
          <Headline size={86 * k}>Your burn is already happening.</Headline>
        </Rise>
        <Rise delay={fps * 0.45} style={{ marginTop: 34 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 34 * k,
              color: C.canvas,
              background: C.signal,
              fontWeight: 700,
              padding: "20px 38px",
              borderRadius: 12,
            }}
          >
            burnlog.net
          </div>
        </Rise>
        <Rise delay={fps * 0.65} style={{ marginTop: 26 }}>
          <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, letterSpacing: 1.5 }}>
            free · open-source CLI · tokens only
          </div>
        </Rise>
      </AbsoluteFill>
    </Ground>
  );
};

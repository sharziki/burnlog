import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, EASE_ENTRANCE, MONO, SANS } from "./brand";

/**
 * The brand system names one motion verb — "rise" — so every entrance in this
 * film is the same move: up and in, on the entrance easing, never a fade from
 * a random direction.
 */
export const Rise: React.FC<{
  delay?: number;
  distance?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, distance = 28, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 500ms entrance from the brand system, expressed in frames.
  const dur = Math.round((500 / 1000) * fps);
  const t = interpolate(frame - delay, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => bezier(x),
  });
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * distance}px)`, ...style }}>
      {children}
    </div>
  );
};

/** cubic-bezier(.16,1,.3,1), the brand system's entrance curve. */
function bezier(x: number): number {
  const [, , , ] = EASE_ENTRANCE;
  // Closed-form-free approximation via Newton iterations on the x polynomial.
  const cx = 3 * 0.16;
  const bx = 3 * (0.3 - 0.16) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * 1;
  const by = 3 * (1 - 1) - cy;
  const ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= xt / d;
  }
  return ((ay * t + by) * t + cy) * t;
};

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.signal,
}) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: 5,
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

export const Headline: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 104,
}) => (
  <h1
    style={{
      fontFamily: SANS,
      fontSize: size,
      fontWeight: 800,
      letterSpacing: -size * 0.038,
      lineHeight: 1.03,
      color: C.text,
      margin: 0,
    }}
  >
    {children}
  </h1>
);

/**
 * The near-black ground with the faint amber bloom the site carries. Kept very
 * low contrast on purpose: the brand's visual protagonist is the number, not
 * the background.
 */
export const Ground: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: C.canvas,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: "-30%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 1600,
        height: 900,
        background: "radial-gradient(ellipse at center, rgba(217,119,6,0.10), transparent 65%)",
      }}
    />
    {children}
  </div>
);

/**
 * Typed terminal text, revealed a character at a time.
 *
 * `holdCursor` keeps the caret blinking after the line finishes, which is right
 * for the last line of a block and wrong for every line above it — two carets
 * on screen at once reads as a rendering bug, not as a terminal.
 */
export const Typed: React.FC<{
  text: string;
  startAt: number;
  cps?: number;
  holdCursor?: boolean;
}> = ({
  text,
  startAt,
  cps = 26,
  holdCursor = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = Math.max(0, (frame - startAt) / fps);
  const shown = Math.min(text.length, Math.floor(elapsed * cps));
  const done = shown >= text.length;
  const blink = Math.floor(frame / (fps * 0.4)) % 2 === 0;
  return (
    <span>
      {text.slice(0, shown)}
      {(!done || (holdCursor && blink)) && <span style={{ color: C.signal }}>▊</span>}
    </span>
  );
};

export const useSpringIn = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
};

/* ------------------------------------------------------ counters + chips --- */

/** Same formatter the site uses, so a number in the film reads as it does on the board. */
export const formatTokens = (n: number): string => {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};

/**
 * A number climbing to its real value.
 *
 * Logarithmic, not linear. A linear count to 152 billion sits at "0.0" for
 * most of its run and then blurs through every rank in the last few frames —
 * the ladder is a log scale, so the counter has to be one too for the rank
 * badge beside it to change at a watchable rate.
 */
export const CountUp: React.FC<{
  to: number;
  startAt: number;
  durationInFrames: number;
  style?: React.CSSProperties;
}> = ({ to, startAt, durationInFrames, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - startAt, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => bezier(x),
  });
  return <span style={style}>{formatTokens(valueAt(to, t))}</span>;
};

/** Shared by the counter and the rank badge so they can never disagree. */
export const valueAt = (to: number, t: number): number => {
  if (t <= 0) return 0;
  // Start at 1K rather than 1 so the early frames aren't a smear of raw digits.
  const from = 1_000;
  return Math.min(to, Math.round(from * Math.pow(to / from, t)));
};

export const Chip: React.FC<{
  children: React.ReactNode;
  color?: string;
  bg?: string;
  border?: string;
  size?: number;
}> = ({ children, color = C.signal, bg = "rgba(217,119,6,0.09)", border = "rgba(217,119,6,0.33)", size = 22 }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.4,
      fontFamily: MONO,
      fontSize: size,
      fontWeight: 700,
      color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: size * 0.36,
      padding: `${size * 0.42}px ${size * 0.7}px`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

/**
 * Fade the first and last few frames of a composition to the ground colour.
 *
 * Social players loop short clips forever, and a hard cut back to frame 0 is
 * the thing that makes a loop look like a mistake rather than a decision.
 */
export const LoopFade: React.FC<{ frames?: number }> = ({ frames = 8 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(
    frame,
    [0, frames, durationInFrames - frames, durationInFrames - 1],
    [1, 0, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ position: "absolute", inset: 0, background: C.canvas, opacity: o, pointerEvents: "none" }} />
  );
};

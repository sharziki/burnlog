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

/** Typed terminal text, revealed a character at a time. */
export const Typed: React.FC<{ text: string; startAt: number; cps?: number }> = ({
  text,
  startAt,
  cps = 26,
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
      {(!done || blink) && <span style={{ color: C.signal }}>▊</span>}
    </span>
  );
};

export const useSpringIn = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
};

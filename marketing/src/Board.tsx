import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, SANS, fontCss } from "./brand";
import { CountUp, Ground, LoopFade, Rise, valueAt } from "./parts";
import { RANKS } from "./ranks";
import { useLayout } from "./scenes";

/**
 * The looping social clip — no narration, no cuts, one idea.
 *
 * X, LinkedIn and Reels autoplay muted and loop forever, so this is built for
 * that slot specifically: eight seconds, one continuous move, and a fade at
 * both ends so the wrap reads as a decision instead of a glitch. There is no
 * call to action inside it; the post carries that.
 *
 * The row is real — the top of the live board on 2026-09-01. That dates the
 * clip, which is the trade: the brand system forbids fabricated usage, and a
 * leaderboard demo with invented users would be exactly that. Re-render it
 * when the number stops being true.
 */
const HANDLE = "sharziki";
const TOKENS = 152_484_942_146;

const parseMin = (s: string): number => {
  if (s === "0") return 0;
  const v = parseFloat(s);
  return v * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[s.slice(-1)];
};

export const BOARD_SECONDS = 8;

export const Board: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, pad, col } = useLayout();

  const start = Math.round(fps * 0.8);
  const dur = Math.round(fps * 4.6);
  const t = interpolate(frame - start, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => 1 - Math.pow(1 - x, 3),
  });
  const value = valueAt(TOKENS, t);
  // The rank actually being stood on — highest floor the counter has passed.
  const current = [...RANKS].reduce((best, r) => (value >= parseMin(r.min) ? r : best), RANKS[0]);

  // Ranks read top-down as the ladder is climbed, so the list is reversed and
  // each row lights the moment the counter passes its floor.
  const ladder = [...RANKS].reverse();

  return (
    <AbsoluteFill style={{ backgroundColor: C.canvas }}>
      <style>{fontCss}</style>
      <Ground>
        <AbsoluteFill style={{ justifyContent: "center", padding: pad }}>
          <Rise style={{ width: col }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 20 * k,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: C.signal,
              }}
            >
              the board
            </div>

            {/* The row. One person, one number, one rank — the brand system's
                "visual protagonist" is exactly this. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26 * k,
                marginTop: 30 * k,
                padding: `${30 * k}px ${34 * k}px`,
                background: C.surface,
                border: `1px solid ${C.borderLoud}`,
                borderRadius: 16 * k,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 40 * k,
                  color: current.color,
                  width: 56 * k,
                  textAlign: "center",
                  lineHeight: 1,
                }}
              >
                {current.icon}
              </span>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 40 * k,
                  fontWeight: 700,
                  color: C.text,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                @{HANDLE}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 44 * k,
                  fontWeight: 700,
                  color: C.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <CountUp to={TOKENS} startAt={start} durationInFrames={dur} />
              </span>
            </div>

            <div style={{ marginTop: 34 * k }}>
              {ladder.map((r) => {
                const min = parseMin(r.min);
                const reached = value >= min;
                // The rank you are actually standing on, rather than every one
                // you have passed, is the one that gets the full treatment.
                const standing = r.name === current.name;
                return (
                  <div
                    key={r.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20 * k,
                      padding: `${9 * k}px 0`,
                      opacity: reached ? 1 : 0.24,
                      transition: "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 26 * k,
                        color: reached ? r.color : C.faint,
                        width: 36 * k,
                        textAlign: "center",
                      }}
                    >
                      {r.icon}
                    </span>
                    <span
                      style={{
                        fontFamily: SANS,
                        fontSize: 26 * k,
                        fontWeight: standing ? 700 : 500,
                        color: standing ? C.text : reached ? C.secondary : C.muted,
                        flex: 1,
                      }}
                    >
                      {r.name}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 21 * k, color: C.muted }}>
                      {r.min === "0" ? "0" : `${r.min}+`}
                    </span>
                    <span
                      style={{
                        width: 10 * k,
                        height: 10 * k,
                        borderRadius: "50%",
                        background: standing ? C.signal : "transparent",
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 28 * k,
                fontFamily: MONO,
                fontSize: 20 * k,
                color: C.faint,
                letterSpacing: 1.5,
              }}
            >
              burnlog.net · the public leaderboard for AI token burn
            </div>
          </Rise>
        </AbsoluteFill>
        <LoopFade frames={Math.round(fps * 0.35)} />
      </Ground>
    </AbsoluteFill>
  );
};

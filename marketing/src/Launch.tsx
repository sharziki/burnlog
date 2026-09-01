import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { fontCss } from "./brand";
import { Climb, Cta, Hook, Terminal } from "./scenes";

/**
 * The launch film. Four beats, cut so each one lands a single idea:
 * why you care, how you start, what you get, where to go.
 *
 * It used to open on three seconds of the mark. That is the one move every
 * guide on the format tells you not to make — a logo answers no question the
 * viewer has yet, and it spends the only seconds you are guaranteed. The film
 * now opens on the problem and keeps the mark for the end card, where it
 * signs off work the viewer has already seen.
 */
export const SCENES = [
  { C: Hook, seconds: 4 },
  { C: Terminal, seconds: 6 },
  { C: Climb, seconds: 6 },
  { C: Cta, seconds: 5 },
] as const;

export const TOTAL_SECONDS = SCENES.reduce((s, x) => s + x.seconds, 0);

export const Launch: React.FC = () => {
  const { fps } = useVideoConfig();
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#09090B" }}>
      <style>{fontCss}</style>
      {SCENES.map(({ C: Scene, seconds }, i) => {
        const from = at;
        at += Math.round(seconds * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={Math.round(seconds * fps)}>
            <Scene />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

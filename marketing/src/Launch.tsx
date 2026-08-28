import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { fontCss } from "./brand";
import { Climb, Cta, Hook, Open, Terminal } from "./scenes";

/**
 * The launch film. Five beats, cut so each one lands a single idea:
 * what it is, why you care, how you start, what you get, where to go.
 */
export const SCENES = [
  { C: Open, seconds: 3 },
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

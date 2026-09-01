import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { fontCss } from "./brand";
import { PasteBeat, PasteCta, RankBeat, WorksBeat } from "./paste-scenes";

/**
 * The paste film — 15 seconds, four beats.
 *
 * Deliberately shorter and faster than the launch film, and it opens on the
 * product rather than the mark: the first frame is already the thing you do,
 * and the claim that pays ("you don't install it, your agent does") is legible
 * by second one. The logo waits until the card at the end, where it is a
 * signature rather than a throat-clear.
 */
export const PASTE_SCENES = [
  { C: PasteBeat, seconds: 4.5 },
  { C: WorksBeat, seconds: 5.5 },
  { C: RankBeat, seconds: 3.2 },
  { C: PasteCta, seconds: 2.8 },
] as const;

export const PASTE_SECONDS = PASTE_SCENES.reduce((s, x) => s + x.seconds, 0);

export const Paste: React.FC = () => {
  const { fps } = useVideoConfig();
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#09090B" }}>
      <style>{fontCss}</style>
      {PASTE_SCENES.map(({ C: Scene, seconds }, i) => {
        const from = at;
        const dur = Math.round(seconds * fps);
        at += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Scene />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

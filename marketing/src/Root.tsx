import React from "react";
import { Composition } from "remotion";
import { Launch, TOTAL_SECONDS } from "./Launch";
import { Paste, PASTE_SECONDS } from "./Paste";
import { Board, BOARD_SECONDS } from "./Board";

const FPS = 30;

/**
 * Three films, each cut for a different slot, and every one shipped in both
 * aspect ratios off a single timeline:
 *
 *   launch  24s  the product, end to end — site, Show HN, Product Hunt
 *   paste   16s  the onboarding claim, on its own — the post that gets replies
 *   board    8s  a silent loop for a feed that autoplays muted
 */
export const Root: React.FC = () => (
  <>
    <Composition
      id="launch"
      component={Launch}
      durationInFrames={Math.round(TOTAL_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="launch-vertical"
      component={Launch}
      durationInFrames={Math.round(TOTAL_SECONDS * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
    />

    <Composition
      id="paste"
      component={Paste}
      durationInFrames={Math.round(PASTE_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="paste-vertical"
      component={Paste}
      durationInFrames={Math.round(PASTE_SECONDS * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
    />

    {/* Square as well: the loop's home is a timeline, and 1:1 keeps more
        vertical pixels than 16:9 in a phone feed without going full portrait. */}
    <Composition
      id="board"
      component={Board}
      durationInFrames={Math.round(BOARD_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="board-square"
      component={Board}
      durationInFrames={Math.round(BOARD_SECONDS * FPS)}
      fps={FPS}
      width={1080}
      height={1080}
    />
    <Composition
      id="board-vertical"
      component={Board}
      durationInFrames={Math.round(BOARD_SECONDS * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
    />
  </>
);

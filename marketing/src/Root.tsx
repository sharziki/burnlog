import React from "react";
import { Composition } from "remotion";
import { Launch, TOTAL_SECONDS } from "./Launch";

const FPS = 30;

export const Root: React.FC = () => (
  <>
    {/* Landscape — the one for the site, X, and Show HN. */}
    <Composition
      id="launch"
      component={Launch}
      durationInFrames={TOTAL_SECONDS * FPS}
      fps={FPS}
      width={1920}
      height={1080}
    />
    {/* Vertical, same timeline — Shorts / Reels / TikTok. */}
    <Composition
      id="launch-vertical"
      component={Launch}
      durationInFrames={TOTAL_SECONDS * FPS}
      fps={FPS}
      width={1080}
      height={1920}
    />
  </>
);

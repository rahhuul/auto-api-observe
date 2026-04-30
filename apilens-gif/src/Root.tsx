import React from "react";
import { Composition } from "remotion";
import { ApiLensLogMagnifier } from "./compositions/ApiLensLogMagnifier";
import { ApiLensDashboardShowcase } from "./compositions/ApiLensDashboardShowcase";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Dashboard Showcase (screenshots) — README / website ── */}

      {/* README GIF — 640×360, 15fps, 12s */}
      <Composition
        id="Dashboard-small"
        component={ApiLensDashboardShowcase}
        durationInFrames={180}
        fps={15}
        width={640}
        height={360}
      />

      {/* HD — YouTube, LinkedIn, website hero */}
      <Composition
        id="Dashboard-16x9"
        component={ApiLensDashboardShowcase}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* ── Original Log Magnifier — social media ── */}

      {/* Landscape */}
      <Composition
        id="ApiLensGif-16x9"
        component={ApiLensLogMagnifier}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Square — Instagram, Twitter */}
      <Composition
        id="ApiLensGif-1x1"
        component={ApiLensLogMagnifier}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1080}
      />

      {/* Portrait — Reels, Stories, TikTok */}
      <Composition
        id="ApiLensGif-9x16"
        component={ApiLensLogMagnifier}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Small log GIF */}
      <Composition
        id="ApiLensGif-small"
        component={ApiLensLogMagnifier}
        durationInFrames={180}
        fps={15}
        width={640}
        height={360}
      />
    </>
  );
};

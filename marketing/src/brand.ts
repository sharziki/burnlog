/**
 * The video's palette and type, taken from design/brand-system.json rather
 * than picked again here. The brand system's invariant is "near-black ground,
 * amber action, mono data", and its prohibitions rule out glass, generic
 * gradients, stock imagery, fake UI and decorative 3D flames — so this file
 * only carries what that document already decided.
 */
import { staticFile } from "remotion";

export const C = {
  canvas: "#09090B",
  surface: "#0C0C0E",
  border: "#18181B",
  borderLoud: "#27272A",
  text: "#FAFAFA",
  secondary: "#A1A1AA",
  muted: "#52525B",
  faint: "#3F3F46",
  signal: "#D97706",
  signalLight: "#F59E0B",
  success: "#10B981",
} as const;

export const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Entrance easing and duration from the brand system's motion block. */
export const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;
export const ENTRANCE_MS = 500;

export const fontCss = `
@font-face {
  font-family: "Instrument Sans";
  src: url("${staticFile("fonts/instrument-sans-400700.woff2")}") format("woff2");
  font-weight: 400 700;
  font-display: block;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("${staticFile("fonts/ibm-plex-mono-400.woff2")}") format("woff2");
  font-weight: 400;
  font-display: block;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("${staticFile("fonts/ibm-plex-mono-600.woff2")}") format("woff2");
  font-weight: 600;
  font-display: block;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("${staticFile("fonts/ibm-plex-mono-700.woff2")}") format("woff2");
  font-weight: 700;
  font-display: block;
}
`;

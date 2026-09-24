import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared building blocks for the Open Graph cards.
 *
 * These render through Satori, which supports only a flexbox subset of CSS —
 * no `gap` shorthand quirks, every child of a multi-child node needs an
 * explicit `display`, and there are no CSS variables. Hence the literal hex
 * values and the hand-rolled flame path instead of reusing <BurnMark/>.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#0B0B0A",
  line: "rgba(237,234,227,0.10)",
  faint: "#4A4742",
  dim: "#7A766E",
  soft: "#A8A39A",
  ink: "#EDEAE3",
  accent: "#F2651C",
};

/** The burnlog mark, inlined as SVG markup Satori can rasterise. */
export function markSvg(size = 56, ground = OG.bg): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <defs><linearGradient id="g" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FDE68A"/><stop offset=".42" stop-color="#F59E0B"/><stop offset="1" stop-color="#C2410C"/>
    </linearGradient></defs>
    <path fill="url(#g)" d="M12 1.4c1.2 3.6 3 5.2 4.7 7 1.7 1.8 2.9 3.6 2.9 6.3 0 4.6-3.5 8.3-7.6 8.3S4.4 19.3 4.4 14.7c0-2.7 1.2-4.5 2.9-6.3C9 6.6 10.8 5 12 1.4z"/>
    <path fill="${ground}" d="M12 9.6 17.6 16.9c.38.5.02 1.22-.6 1.22h-2.23c-.24 0-.47-.12-.61-.31L12 14.65l-2.16 3.15c-.14.19-.37.31-.61.31H7c-.62 0-.98-.72-.6-1.22L12 9.6z"/>
  </svg>`;
}

export function markDataUri(size = 56, ground = OG.bg): string {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(size, ground)).toString("base64")}`;
}

/** Cache OG images hard — they're regenerated on the next revalidation window. */
export const OG_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
};

/**
 * Real fonts for the cards. Satori's fallback has one weight, so a "big bold
 * number" came out regular and the card read like a spreadsheet. Satori takes
 * TTF/OTF but not WOFF2 or variable fonts, so these are static cuts of the
 * site's own faces (Instrument Sans 400/700, IBM Plex Mono 500/700, Instrument Serif) in
 * web/assets/og. The literal `process.cwd()` joins are what file tracing
 * follows; next.config.mjs includes the folder too, belt and braces.
 */

type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" };
let fonts: Promise<OgFont[]> | null = null;

export function ogFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), "assets/og/instrument-sans-400.ttf")),
    readFile(join(process.cwd(), "assets/og/instrument-sans-700.ttf")),
    readFile(join(process.cwd(), "assets/og/plex-mono-500.ttf")),
    readFile(join(process.cwd(), "assets/og/plex-mono-700.ttf")),
    readFile(join(process.cwd(), "assets/og/instrument-serif-400.ttf")),
  ]).then(([s4, s7, m5, m7, serif]) => [
    { name: "Sans", data: s4, weight: 400, style: "normal" },
    { name: "Sans", data: s7, weight: 700, style: "normal" },
    { name: "Mono", data: m5, weight: 500, style: "normal" },
    { name: "Mono", data: m7, weight: 700, style: "normal" },
    { name: "Serif", data: serif, weight: 400, style: "normal" },
  ]);
  return fonts;
}

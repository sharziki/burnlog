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
  bg: "#09090B",
  surface: "#0C0C0E",
  border: "#18181B",
  subtle: "#3F3F46",
  gray: "#71717A",
  light: "#E4E4E7",
  white: "#FAFAFA",
  amber: "#D97706",
  amberBright: "#F59E0B",
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

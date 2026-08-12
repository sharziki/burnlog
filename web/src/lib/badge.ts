import { getRank, type Rank } from "./ranks";
import { formatTokens } from "./format";

/**
 * The README badge.
 *
 * The old one was a stock shields.io clone — grey slab, Verdana, a flat colour
 * block. It said "burnlog" but looked like every other badge on the row, which
 * is the opposite of what a badge is for: it has to be recognisable at a
 * glance in a wall of them.
 *
 * This one carries the burnlog mark and the rank's own colour, on the product's
 * own black. Everything is inline — GitHub strips <style>, external fonts, and
 * scripts from README SVGs, so all styling has to live on the elements, and
 * text has to be measured by hand because there is no layout engine.
 */

export type BadgeStyle = "default" | "compact" | "flat";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Approximate advance width for the monospace stack at a given size.
 * A real metric is impossible without shaping the font, and being a couple of
 * pixels generous is invisible where being tight clips the text.
 */
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

const FONT = "ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,monospace";

/** The mark, as inline path data — no external reference survives GitHub. */
function markPaths(x: number, y: number, size: number, ground: string): string {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path fill="url(#flame)" d="M12 1.4c1.2 3.6 3 5.2 4.7 7 1.7 1.8 2.9 3.6 2.9 6.3 0 4.6-3.5 8.3-7.6 8.3S4.4 19.3 4.4 14.7c0-2.7 1.2-4.5 2.9-6.3C9 6.6 10.8 5 12 1.4z"/>
    <path fill="${ground}" d="M12 9.6 17.6 16.9c.38.5.02 1.22-.6 1.22h-2.23c-.24 0-.47-.12-.61-.31L12 14.65l-2.16 3.15c-.14.19-.37.31-.61.31H7c-.62 0-.98-.72-.6-1.22L12 9.6z"/>
  </g>`;
}

export function buildBadge(
  tokens: number,
  style: BadgeStyle = "default",
): { svg: string; rank: Rank } {
  const rank = getRank(tokens);
  const bg = "#09090B";
  const amount = formatTokens(tokens);

  if (style === "compact") {
    // Just the mark and the number, for a dense badge row.
    const fs = 11;
    const w = Math.round(26 + textWidth(amount, fs) + 8);
    return {
      rank,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="burnlog: ${escapeXml(amount)} tokens">
  <defs>${flameGradient()}</defs>
  <rect width="${w}" height="20" rx="4" fill="${bg}"/>
  <rect width="${w}" height="20" rx="4" fill="none" stroke="${rank.color}" stroke-opacity="0.35"/>
  ${markPaths(6, 3, 14, bg)}
  <text x="${24}" y="14" font-family="${FONT}" font-size="${fs}" fill="#FAFAFA">${escapeXml(amount)}</text>
</svg>`,
    };
  }

  const fs = 11;
  const label = rank.name.toUpperCase();
  const labelW = textWidth(label, 10);
  const amountW = textWidth(amount, fs);
  // mark + gap + rank + gap + amount + padding
  const width = Math.round(24 + labelW + 10 + amountW + 10);
  const height = 20;

  const flat = style === "flat";

  return {
    rank,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="burnlog: ${escapeXml(rank.name)}, ${escapeXml(amount)} tokens">
  <defs>
    ${flameGradient()}
    ${flat ? "" : `<linearGradient id="sheen" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-opacity="0"/></linearGradient>`}
  </defs>
  <rect width="${width}" height="${height}" rx="4" fill="${bg}"/>
  <rect width="${width}" height="${height}" rx="4" fill="none" stroke="${rank.color}" stroke-opacity="0.4"/>
  ${flat ? "" : `<rect width="${width}" height="${height}" rx="4" fill="url(#sheen)"/>`}
  ${markPaths(5, 3, 14, bg)}
  <text x="22" y="14" font-family="${FONT}" font-size="10" letter-spacing="0.6" fill="${rank.color}">${escapeXml(label)}</text>
  <text x="${22 + labelW + 10}" y="14" font-family="${FONT}" font-size="${fs}" font-weight="600" fill="#FAFAFA">${escapeXml(amount)}</text>
</svg>`,
  };
}

function flameGradient(): string {
  return `<linearGradient id="flame" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FDE68A"/><stop offset=".42" stop-color="#F59E0B"/><stop offset="1" stop-color="#C2410C"/>
    </linearGradient>`;
}

/** Shown when the username doesn't exist — still branded, never a broken image. */
export function buildMissingBadge(): string {
  const width = 104;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="burnlog: unknown user">
  <defs>${flameGradient()}</defs>
  <rect width="${width}" height="20" rx="4" fill="#09090B"/>
  <rect width="${width}" height="20" rx="4" fill="none" stroke="#27272A"/>
  ${markPaths(5, 3, 14, "#09090B")}
  <text x="22" y="14" font-family="${FONT}" font-size="10" fill="#71717A">no such user</text>
</svg>`;
}

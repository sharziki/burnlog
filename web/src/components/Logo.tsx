/**
 * The burnlog mark: a flame silhouette with a terminal caret cut out of it.
 * Fire because that's the product; a caret because it lives in your shell.
 * Two paths, pure geometry — stays legible down to a 16px favicon.
 *
 * `ground` is the colour showing through the caret. It must match whatever
 * the mark sits on (dark UI, white README, OG card), so it's a prop rather
 * than a hardcoded #09090B.
 */
export function BurnMark({
  size = 32,
  ground = "#09090B",
  gradientId = "burnmark",
  flat,
}: {
  size?: number;
  ground?: string;
  /** Stable id — must be unique per page when several marks render at once. */
  gradientId?: string;
  /** Render in a single solid colour instead of the amber gradient. */
  flat?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {!flat && (
        <defs>
          <linearGradient id={gradientId} x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE68A" />
            <stop offset="0.42" stopColor="#F59E0B" />
            <stop offset="1" stopColor="#C2410C" />
          </linearGradient>
        </defs>
      )}
      <path
        fill={flat ?? `url(#${gradientId})`}
        d="M12 1.4c1.2 3.6 3 5.2 4.7 7 1.7 1.8 2.9 3.6 2.9 6.3 0 4.6-3.5 8.3-7.6 8.3S4.4 19.3 4.4 14.7c0-2.7 1.2-4.5 2.9-6.3C9 6.6 10.8 5 12 1.4z"
      />
      <path
        fill={ground}
        d="M12 9.6 17.6 16.9c.38.5.02 1.22-.6 1.22h-2.23c-.24 0-.47-.12-.61-.31L12 14.65l-2.16 3.15c-.14.19-.37.31-.61.31H7c-.62 0-.98-.72-.6-1.22L12 9.6z"
      />
    </svg>
  );
}

const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';
const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Mark + wordmark lockup used in the nav and footer. */
export function Logo({
  size = 32,
  tagline = "token burn tracker",
  ground = "#09090B",
}: {
  size?: number;
  tagline?: string | null;
  ground?: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <BurnMark size={size} ground={ground} />
      <span>
        <span
          style={{
            display: "block",
            fontSize: size * 0.58,
            fontWeight: 700,
            color: "#FAFAFA",
            letterSpacing: -0.6,
            fontFamily: SANS,
            lineHeight: 1,
          }}
        >
          burnlog
        </span>
        {tagline && (
          <span
            style={{
              display: "block",
              fontSize: 9,
              color: "#52525B",
              letterSpacing: 2.4,
              textTransform: "uppercase",
              marginTop: 4,
              fontFamily: MONO,
              lineHeight: 1,
            }}
          >
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}

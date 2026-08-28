/**
 * The product mark, copied path-for-path from web/src/components/Logo.tsx.
 *
 * A flame with a terminal caret cut out of it. `ground` is the colour showing
 * through the caret, so it has to match whatever the mark sits on.
 */
export const BurnMark: React.FC<{ size?: number; ground?: string; gradientId?: string }> = ({
  size = 32,
  ground = "#09090B",
  gradientId = "burnmark",
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={gradientId} x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FDE68A" />
        <stop offset="0.42" stopColor="#F59E0B" />
        <stop offset="1" stopColor="#C2410C" />
      </linearGradient>
    </defs>
    <path
      fill={`url(#${gradientId})`}
      d="M12 1.4c1.2 3.6 3 5.2 4.7 7 1.7 1.8 2.9 3.6 2.9 6.3 0 4.6-3.5 8.3-7.6 8.3S4.4 19.3 4.4 14.7c0-2.7 1.2-4.5 2.9-6.3C9 6.6 10.8 5 12 1.4z"
    />
    <path
      fill={ground}
      d="M12 9.6 17.6 16.9c.38.5.02 1.22-.6 1.22h-2.23c-.24 0-.47-.12-.61-.31L12 14.65l-2.16 3.15c-.14.19-.37.31-.61.31H7c-.62 0-.98-.72-.6-1.22L12 9.6z"
    />
  </svg>
);

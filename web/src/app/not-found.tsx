const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

export default function NotFound() {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "80px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: "#18181B",
          fontFamily: MONO,
          lineHeight: 1,
          marginBottom: 16,
        }}
      >
        404
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#E4E4E7",
          fontFamily: SANS,
          marginBottom: 8,
        }}
      >
        Page not found
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#52525B",
          fontFamily: SANS,
          marginBottom: 32,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </div>
      <a
        href="/"
        style={{
          fontSize: 12,
          color: "#D97706",
          border: "1px solid #18181B",
          borderRadius: 6,
          padding: "8px 20px",
          fontFamily: MONO,
          textDecoration: "none",
        }}
      >
        back to leaderboard
      </a>
    </div>
  );
}

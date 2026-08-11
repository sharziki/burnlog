"use client";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          fontSize: 48,
          fontWeight: 800,
          color: "#D97706",
          fontFamily: MONO,
          marginBottom: 16,
        }}
      >
        oops
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#71717A",
          fontFamily: SANS,
          marginBottom: 8,
        }}
      >
        Something went wrong loading this page.
      </div>
      {error.digest && (
        <div
          style={{
            fontSize: 10,
            color: "#3F3F46",
            fontFamily: MONO,
            marginBottom: 24,
          }}
        >
          error id: {error.digest}
        </div>
      )}
      <button
        onClick={reset}
        style={{
          fontSize: 12,
          color: "#D97706",
          background: "transparent",
          border: "1px solid #18181B",
          borderRadius: 6,
          padding: "8px 20px",
          cursor: "pointer",
          fontFamily: MONO,
        }}
      >
        try again
      </button>
    </div>
  );
}

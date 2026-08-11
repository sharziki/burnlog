const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

function Skeleton({ width, height = 16 }: { width: number | string; height?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: "#18181B",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Header skeleton */}
      <div style={{ marginBottom: 32 }}>
        <Skeleton width={200} height={24} />
        <div style={{ marginTop: 8 }}>
          <Skeleton width={320} height={12} />
        </div>
      </div>

      {/* Leaderboard rows skeleton */}
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 0",
            borderBottom: "1px solid #18181B",
          }}
        >
          <Skeleton width={24} height={24} />
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#18181B",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div style={{ flex: 1 }}>
            <Skeleton width={120} height={14} />
            <div style={{ marginTop: 6 }}>
              <Skeleton width={80} height={10} />
            </div>
          </div>
          <Skeleton width={80} height={14} />
        </div>
      ))}

      <div style={{ textAlign: "center", marginTop: 32, fontFamily: MONO, fontSize: 11, color: "#3F3F46" }}>
        loading...
      </div>
    </div>
  );
}

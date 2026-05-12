"use client";

import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';
const DOLLARS_PER_TOKEN = 0.00001;

type Metric = {
  label: string;
  left: number;
  right: number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

function formatUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function buildMetrics(l: UserStats, r: UserStats): Metric[] {
  return [
    { label: "Total Tokens", left: l.totalTokens, right: r.totalTokens, format: (v) => formatTokens(v) },
    { label: "Weekly Tokens", left: l.weeklyTokens, right: r.weeklyTokens, format: (v) => formatTokens(v) },
    { label: "Streak", left: l.streak, right: r.streak, format: (v) => `${v}d` },
    { label: "Tok / Session", left: l.tokensPerCommit, right: r.tokensPerCommit, format: (v) => v.toLocaleString(), lowerIsBetter: true },
    { label: "Est. Spend", left: l.totalTokens * DOLLARS_PER_TOKEN, right: r.totalTokens * DOLLARS_PER_TOKEN, format: (v) => formatUSD(v) },
  ];
}

function ProviderBar({ providers }: { providers: UserStats["providers"] }) {
  const colors: Record<string, string> = { anthropic: "#D97706", openai: "#10B981", google: "#3B82F6", other: "#52525B" };
  const labels: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", other: "Other" };
  const entries = Object.entries(providers).filter(([, v]) => v > 0);
  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8, background: "#18181B" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ width: `${v * 100}%`, background: colors[k] }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {entries.map(([k, v]) => (
          <span key={k} style={{ fontSize: 11, color: "#52525B", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors[k], display: "inline-block" }} />
            {labels[k]} {Math.round(v * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function H2HClient({ left, right }: { left: UserStats; right: UserStats }) {
  const leftRank = getRank(left.totalTokens);
  const rightRank = getRank(right.totalTokens);
  const metrics = buildMetrics(left, right);

  let leftWins = 0;
  let rightWins = 0;
  for (const m of metrics) {
    const lb = m.lowerIsBetter ? m.left < m.right : m.left > m.right;
    const rb = m.lowerIsBetter ? m.right < m.left : m.right > m.left;
    if (lb) leftWins++;
    else if (rb) rightWins++;
  }

  return (
    <div style={{ fontFamily: SANS, background: "#09090B", color: "#E4E4E7", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div
        style={{ position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none", zIndex: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />
      <div style={{ position: "fixed", top: -200, right: -200, width: 600, height: 600, background: "radial-gradient(circle, rgba(217,119,6,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 10, color: "#52525B", letterSpacing: 2, textTransform: "uppercase", fontFamily: MONO, marginBottom: 24 }}>
          HEAD-TO-HEAD
        </div>

        {/* Matchup header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 24, alignItems: "center", marginBottom: 40 }}>
          {/* Left */}
          <a href={`/u/${left.username}`} style={{ textDecoration: "none", textAlign: "center" }}>
            {left.image ? (
              <img src={left.image} alt={left.username} width={72} height={72} style={{ borderRadius: 16, border: `3px solid ${leftRank.color}44`, objectFit: "cover", display: "block", margin: "0 auto 12px" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 16, background: `${leftRank.color}22`, border: `3px solid ${leftRank.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: leftRank.color, fontFamily: MONO, margin: "0 auto 12px" }}>
                {left.avatar}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>{left.name}</div>
            <div style={{ fontSize: 12, color: "#52525B", fontFamily: MONO }}>@{left.username}</div>
            <div style={{ fontSize: 11, color: leftRank.color, fontFamily: MONO, marginTop: 4 }}>{leftRank.icon} {leftRank.name}</div>
          </a>

          {/* VS */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: leftWins > rightWins ? "#D97706" : "#3F3F46", fontFamily: MONO, lineHeight: 1 }}>{leftWins}</div>
            <div style={{ fontSize: 16, color: "#18181B", fontFamily: MONO, margin: "4px 0" }}>—</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: rightWins > leftWins ? "#D97706" : "#3F3F46", fontFamily: MONO, lineHeight: 1 }}>{rightWins}</div>
          </div>

          {/* Right */}
          <a href={`/u/${right.username}`} style={{ textDecoration: "none", textAlign: "center" }}>
            {right.image ? (
              <img src={right.image} alt={right.username} width={72} height={72} style={{ borderRadius: 16, border: `3px solid ${rightRank.color}44`, objectFit: "cover", display: "block", margin: "0 auto 12px" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 16, background: `${rightRank.color}22`, border: `3px solid ${rightRank.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: rightRank.color, fontFamily: MONO, margin: "0 auto 12px" }}>
                {right.avatar}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>{right.name}</div>
            <div style={{ fontSize: 12, color: "#52525B", fontFamily: MONO }}>@{right.username}</div>
            <div style={{ fontSize: 11, color: rightRank.color, fontFamily: MONO, marginTop: 4 }}>{rightRank.icon} {rightRank.name}</div>
          </a>
        </div>

        {/* Metric rows */}
        <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 14, padding: 28, marginBottom: 24 }}>
          {metrics.map((m) => {
            const leftWin = m.lowerIsBetter ? m.left < m.right : m.left > m.right;
            const rightWin = m.lowerIsBetter ? m.right < m.left : m.right > m.left;
            return (
              <div
                key={m.label}
                style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #18181B", fontFamily: MONO }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: leftWin ? "#D97706" : "#52525B", textAlign: "right", paddingRight: 16 }}>
                  {m.format(m.left)}
                </div>
                <div style={{ fontSize: 10, color: "#3F3F46", letterSpacing: 1, textTransform: "uppercase", textAlign: "center" }}>
                  {m.label}
                  {m.lowerIsBetter && <div style={{ fontSize: 8, color: "#3F3F46" }}>(lower is better)</div>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: rightWin ? "#D97706" : "#52525B", textAlign: "left", paddingLeft: 16 }}>
                  {m.format(m.right)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Provider breakdown */}
        <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 14, padding: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 10, color: "#3F3F46", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: MONO }}>
              @{left.username} providers
            </div>
            <ProviderBar providers={left.providers} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#3F3F46", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, fontFamily: MONO }}>
              @{right.username} providers
            </div>
            <ProviderBar providers={right.providers} />
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center" }}>
          <a href="/" style={{ fontSize: 12, color: "#52525B", textDecoration: "none", fontFamily: MONO, padding: "8px 16px", border: "1px solid #18181B", borderRadius: 6 }}>
            ← back to leaderboard
          </a>
        </div>
      </div>
    </div>
  );
}

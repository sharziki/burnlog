"use client";

import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { dollarsPerToken } from "@/lib/cost";
import type { UserStats } from "@/lib/stats";
import { compareUsers, outcomeOf, verdictOf } from "@/lib/h2h";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';
const DOLLARS_PER_TOKEN = dollarsPerToken();

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
  const metrics = compareUsers(left, right, formatTokens, (v) => formatUSD(v * DOLLARS_PER_TOKEN));
  const verdict = verdictOf(metrics, left.name, right.name);
  const leftWins = verdict.left;
  const rightWins = verdict.right;

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
            const outcome = outcomeOf(m);
            const leftWin = outcome === "left";
            const rightWin = outcome === "right";
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
                  <div style={{ fontSize: 8, color: "#27272A", textTransform: "none", letterSpacing: 0, marginTop: 3 }}>
                    {m.unscored ? "context only" : m.hint}
                  </div>
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

        {/* Verdict — say why, not just what */}
        <div
          style={{
            background: verdict.winner === "draw" ? "#0C0C0E" : "#D9770610",
            border: `1px solid ${verdict.winner === "draw" ? "#18181B" : "#D9770633"}`,
            borderRadius: 12,
            padding: "18px 22px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 10, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: MONO, marginBottom: 8 }}>
            Verdict
          </div>
          <div style={{ fontSize: 15, color: "#E4E4E7", lineHeight: 1.6 }}>{verdict.summary}</div>
          <div style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginTop: 10, lineHeight: 1.6 }}>
            Scored on the last 30 days only, so tenure doesn&apos;t decide it. Rows within 5% count
            as a tie. All-time and cost are shown for context but never scored — cost is derived
            from tokens, so scoring both would count the same thing twice.
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

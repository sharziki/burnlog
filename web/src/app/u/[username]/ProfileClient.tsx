"use client";

import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';
const DOLLARS_PER_TOKEN = 0.00001;

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "openclaw",
  "anthropic-api": "Anthropic API",
  "openai-api": "OpenAI API",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

// --- Sparkline ---
function Sparkline({ data, color = "#FAFAFA", height = 40, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return <svg width={width} height={height} />;
  const allZero = data.every((v) => v === 0);
  if (allZero) {
    const mid = height / 2;
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={mid} x2={width} y2={mid} stroke="#27272A" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
      </svg>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r={3} fill={color} />
    </svg>
  );
}

// --- Provider Bar ---
function ProviderBar({ providers }: { providers: UserStats["providers"] }) {
  const colors: Record<string, string> = { anthropic: "#D97706", openai: "#10B981", google: "#3B82F6", other: "#52525B" };
  const labels: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", other: "Other" };
  const entries = Object.entries(providers).filter(([, v]) => v > 0);
  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8, background: "#18181B" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ width: `${v * 100}%`, background: colors[k], transition: "width 0.6s ease" }} />
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

// --- Activity Heatmap ---
function ActivityHeatmap({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(...heatmap, 1);
  const cells = heatmap.map((v, idx) => {
    const week = Math.floor(idx / 7);
    const day = idx % 7;
    const intensity = v / max;
    let background = "#0F0F11";
    if (intensity > 0) background = "rgba(217,119,6,0.12)";
    if (intensity > 0.15) background = "rgba(217,119,6,0.28)";
    if (intensity > 0.35) background = "rgba(217,119,6,0.45)";
    if (intensity > 0.6) background = "rgba(217,119,6,0.7)";
    if (intensity > 0.85) background = "rgba(217,119,6,1)";
    return (
      <div
        key={idx}
        title={`${formatTokens(v)} tokens`}
        style={{
          gridColumn: week + 1,
          gridRow: day + 1,
          background,
          border: "1px solid #09090B",
          borderRadius: 6,
          aspectRatio: "1 / 1",
          transition: "background 0.2s ease",
        }}
      />
    );
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridTemplateRows: "repeat(7, auto)", gap: 6, width: "100%" }}>
      {cells}
    </div>
  );
}

export function ProfileClient({ user, joinedAt }: { user: UserStats; joinedAt: string }) {
  const rank = getRank(user.totalTokens);
  const spend = user.totalTokens * DOLLARS_PER_TOKEN;
  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div style={{ fontFamily: SANS, background: "#09090B", color: "#E4E4E7", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Noise texture */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.03,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Glow */}
      <div
        style={{
          position: "fixed",
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(217,119,6,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px", position: "relative", zIndex: 1 }}>
        {/* ─── Header ─── */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 40 }}>
          {/* Avatar */}
          {user.image ? (
            <img
              src={user.image}
              alt={user.username}
              width={88}
              height={88}
              style={{ borderRadius: 16, border: `3px solid ${rank.color}44`, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 16,
                background: `${rank.color}22`,
                border: `3px solid ${rank.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color: rank.color,
                fontFamily: MONO,
                flexShrink: 0,
              }}
            >
              {user.avatar}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FAFAFA", margin: 0, fontFamily: SANS }}>{user.name}</h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: `${rank.color}18`,
                  border: `1px solid ${rank.color}33`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: rank.color,
                  fontFamily: MONO,
                }}
              >
                {rank.icon} {rank.name}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#52525B", fontFamily: MONO, marginTop: 4 }}>@{user.username}</div>

            {user.bio && (
              <p style={{ fontSize: 14, color: "#A1A1AA", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>{user.bio}</p>
            )}

            {/* Social links + meta */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              {user.github && (
                <a
                  href={`https://github.com/${user.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                  {user.github}
                </a>
              )}
              {user.twitter && (
                <a
                  href={`https://x.com/${user.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @{user.twitter}
                </a>
              )}
              {user.website && (
                <a
                  href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {user.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>joined {joinDate}</span>
              <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>active {relativeTime(user.lastActive)}</span>
            </div>
          </div>
        </div>

        {/* ─── Stats Grid ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Total Tokens", value: formatTokens(user.totalTokens), sub: `$${spend >= 1 ? spend.toFixed(2) : spend.toFixed(4)} est. spend` },
            { label: "Weekly Tokens", value: formatTokens(user.weeklyTokens), sub: null },
            { label: "Streak", value: `${user.streak}d`, sub: user.longestStreak > user.streak ? `best: ${user.longestStreak}d` : user.streak > 0 ? "personal best!" : "no active streak" },
            { label: "Sessions", value: user.commits.toLocaleString(), sub: user.tokensPerCommit ? `~${formatTokens(user.tokensPerCommit)} tok/session` : null },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "#0C0C0E",
                border: "1px solid #18181B",
                borderRadius: 10,
                padding: "18px 20px",
              }}
            >
              <div style={{ fontSize: 10, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, fontFamily: MONO }}>
                {s.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#FAFAFA", fontFamily: MONO }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: "#3F3F46", marginTop: 4, fontFamily: MONO }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* ─── Heatmap ─── */}
        <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
            12-WEEK ACTIVITY
          </div>
          <ActivityHeatmap heatmap={user.heatmap} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 10, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginRight: 4 }}>Less</span>
            {[0, 0.12, 0.28, 0.45, 0.7, 1].map((opacity, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: opacity === 0 ? "#0F0F11" : `rgba(217,119,6,${opacity})`,
                  border: "1px solid #09090B",
                }}
              />
            ))}
            <span style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginLeft: 4 }}>More</span>
          </div>
        </div>

        {/* ─── Weekly Sparkline + Provider Split ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              7-DAY TREND
            </div>
            <Sparkline data={user.weeklyHistory} color="#D97706" height={60} width={360} />
          </div>
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              PROVIDER SPLIT
            </div>
            <ProviderBar providers={user.providers} />
          </div>
        </div>

        {/* ─── Sources + Top Models ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {/* Sources */}
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              SOURCES
            </div>
            {user.sources.length === 0 ? (
              <div style={{ fontSize: 12, color: "#3F3F46", fontFamily: MONO }}>No data yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {user.sources.map((s) => {
                  const total = user.sources.reduce((sum, x) => sum + x.tokens, 0) || 1;
                  const pct = Math.round((s.tokens / total) * 100);
                  return (
                    <div key={s.source} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO }}>
                      <span style={{ fontSize: 12, color: "#D97706", fontWeight: 700, minWidth: 100 }}>
                        {SOURCE_LABELS[s.source] ?? s.source}
                      </span>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#18181B", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#D97706", borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#52525B", minWidth: 60, textAlign: "right" }}>{formatTokens(s.tokens)}</span>
                      <span style={{ fontSize: 10, color: "#3F3F46", minWidth: 30, textAlign: "right" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Models */}
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              TOP MODELS
            </div>
            {user.topModels.length === 0 ? (
              <div style={{ fontSize: 12, color: "#3F3F46", fontFamily: MONO }}>No data yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {user.topModels.map((m, i) => {
                  const total = user.topModels.reduce((sum, x) => sum + x.tokens, 0) || 1;
                  const pct = Math.round((m.tokens / total) * 100);
                  return (
                    <div key={m.model} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO }}>
                      <span style={{ fontSize: 12, color: i === 0 ? "#D97706" : "#52525B", fontWeight: 600, width: 18, textAlign: "center" }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: "#E4E4E7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.model}
                      </span>
                      <span style={{ fontSize: 11, color: "#52525B" }}>{formatTokens(m.tokens)}</span>
                      <span style={{ fontSize: 10, color: "#3F3F46", minWidth: 30, textAlign: "right" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Badge Embed ─── */}
        <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
            EMBED BADGE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/badge/${user.username}`} alt="burnlog badge" height={20} />
            <code
              style={{
                fontSize: 11,
                color: "#71717A",
                background: "#09090B",
                padding: "6px 10px",
                borderRadius: 4,
                fontFamily: MONO,
                border: "1px solid #18181B",
                wordBreak: "break-all",
              }}
            >
              {`[![burnlog](https://burnlog.net/badge/${user.username})](https://burnlog.net/u/${user.username})`}
            </code>
          </div>
        </div>

        {/* Back link */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <a
            href="/"
            style={{
              fontSize: 12,
              color: "#52525B",
              textDecoration: "none",
              fontFamily: MONO,
              padding: "8px 16px",
              border: "1px solid #18181B",
              borderRadius: 6,
            }}
          >
            ← back to leaderboard
          </a>
        </div>
      </div>
    </div>
  );
}

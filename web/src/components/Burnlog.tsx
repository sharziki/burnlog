"use client";

import { useEffect, useRef, useState } from "react";
import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "openclaw",
  "anthropic-api": "Anthropic API",
  "openai-api": "OpenAI API",
};

// --- Animated Counter ---
function AnimCount({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = null;
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      setDisplay(Math.floor(progress * value));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{formatTokens(display)}</>;
}

// --- Sparkline ---
function Sparkline({
  data,
  color = "#fff",
  height = 40,
  width = 120,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data.length) return <svg width={width} height={height} />;
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
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={lastY} r={3} fill={color} />
    </svg>
  );
}

// --- Provider Bar ---
function ProviderBar({ providers }: { providers: UserStats["providers"] }) {
  const colors: Record<string, string> = {
    anthropic: "#D97706",
    openai: "#10B981",
    google: "#3B82F6",
    other: "#6B7280",
  };
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    other: "Other",
  };
  const entries = Object.entries(providers).filter(([, v]) => v > 0);
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 8,
          background: "#141414",
        }}
      >
        {entries.map(([k, v]) => (
          <div
            key={k}
            style={{
              width: `${v * 100}%`,
              background: colors[k],
              transition: "width 0.6s ease",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {entries.map(([k, v]) => (
          <span
            key={k}
            style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: colors[k],
                display: "inline-block",
              }}
            />
            {labels[k]} {Math.round(v * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Sources Strip ---
function SourcesStrip({ sources }: { sources: UserStats["sources"] }) {
  if (!sources.length) return null;
  const total = sources.reduce((s, x) => s + x.tokens, 0) || 1;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {sources.map((s) => (
        <div
          key={s.source}
          style={{
            padding: "6px 12px",
            background: "#0D0D0D",
            border: "1px solid #1F1F1F",
            borderRadius: 6,
            fontSize: 11,
            color: "#9CA3AF",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#D97706", fontWeight: 700 }}>{SOURCE_LABELS[s.source] ?? s.source}</span>
          <span style={{ color: "#4B5563" }}>·</span>
          <span style={{ color: "#fff" }}>{formatTokens(s.tokens)}</span>
          <span style={{ color: "#4B5563" }}>({Math.round((s.tokens / total) * 100)}%)</span>
        </div>
      ))}
    </div>
  );
}

// --- Rank Badge SVG preview ---
function RankBadgePreview({ user }: { user: UserStats }) {
  const rank = getRank(user.totalTokens);
  return (
    <div
      style={{
        background: "#0D0D0D",
        border: "1px solid #1F1F1F",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "'JetBrains Mono', monospace",
        width: "fit-content",
      }}
    >
      <span style={{ fontSize: 18 }}>{rank.icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "#6B7280", letterSpacing: 1 }}>BURNLOG</div>
        <div style={{ fontSize: 14, color: rank.color, fontWeight: 700 }}>
          {rank.name} · {formatTokens(user.totalTokens)} tokens
        </div>
      </div>
      <span style={{ fontSize: 12, color: "#4B5563", marginLeft: 8 }}>@{user.username}</span>
    </div>
  );
}

// --- Activity Heatmap (real data, full-width) ---
function ActivityHeatmap({ heatmap }: { heatmap: number[] }) {
  // heatmap has 84 entries, chronological oldest -> newest.
  // Render as 12 columns (weeks) x 7 rows (days).
  const max = Math.max(...heatmap, 1);
  const cells = heatmap.map((v, idx) => {
    const week = Math.floor(idx / 7);
    const day = idx % 7;
    const intensity = v / max;
    let background = "#0D0D0D";
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
          border: "1px solid #0A0A0A",
          borderRadius: 6,
          aspectRatio: "1 / 1",
          transition: "background 0.2s ease",
        }}
      />
    );
  });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gridTemplateRows: "repeat(7, auto)",
        gap: 6,
        width: "100%",
      }}
    >
      {cells}
    </div>
  );
}

export function Burnlog({
  users,
  currentUsername,
}: {
  users: UserStats[];
  currentUsername: string | null;
}) {
  const [tab, setTab] = useState<"leaderboard" | "profile" | "badges">("leaderboard");
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(users[0] ?? null);
  const [timeframe, setTimeframe] = useState<"all-time" | "weekly">("all-time");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rank = selectedUser ? getRank(selectedUser.totalTokens) : RANKS[0];

  const sortedUsers = [...users].sort((a, b) => {
    if (timeframe === "weekly") return b.weeklyTokens - a.weeklyTokens;
    return b.totalTokens - a.totalTokens;
  });

  const globalStats = {
    totalBurned: users.reduce((s, u) => s + u.totalTokens, 0),
    activeUsers: users.length,
    avgPerUser: users.length
      ? Math.round(users.reduce((s, u) => s + u.totalTokens, 0) / users.length)
      : 0,
    weeklyTotal: users.reduce((s, u) => s + u.weeklyTokens, 0),
  };

  const styles = {
    app: {
      fontFamily: "'JetBrains Mono', monospace",
      background: "#050505",
      color: "#E5E5E5",
      minHeight: "100vh",
      position: "relative" as const,
      overflow: "hidden" as const,
    },
    noise: {
      position: "fixed" as const,
      inset: 0,
      opacity: 0.03,
      pointerEvents: "none" as const,
      zIndex: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    },
    glow: {
      position: "fixed" as const,
      top: -200,
      right: -200,
      width: 600,
      height: 600,
      background: "radial-gradient(circle, rgba(217,119,6,0.06) 0%, transparent 70%)",
      pointerEvents: "none" as const,
      zIndex: 0,
    },
    container: {
      maxWidth: 1100,
      margin: "0 auto",
      padding: "0 24px",
      position: "relative" as const,
      zIndex: 1,
    },
    header: {
      padding: "32px 0 24px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid #141414",
    },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    logoMark: {
      width: 32,
      height: 32,
      borderRadius: 6,
      background: "linear-gradient(135deg, #D97706 0%, #92400E 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      fontWeight: 800 as const,
      color: "#000",
    },
    logoText: { fontSize: 18, fontWeight: 700 as const, color: "#fff", letterSpacing: -0.5 },
    logoSub: {
      fontSize: 10,
      color: "#6B7280",
      letterSpacing: 2,
      textTransform: "uppercase" as const,
      marginTop: 2,
    },
    nav: {
      display: "flex",
      gap: 2,
      background: "#0A0A0A",
      borderRadius: 8,
      padding: 3,
      border: "1px solid #141414",
    },
    navBtn: (active: boolean) => ({
      padding: "8px 16px",
      borderRadius: 6,
      border: "none",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 600 as const,
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: 0.5,
      background: active ? "#1A1A1A" : "transparent",
      color: active ? "#D97706" : "#6B7280",
      transition: "all 0.2s ease",
    }),
    heroStats: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      padding: "28px 0",
    },
    statCard: {
      background: "#0A0A0A",
      border: "1px solid #141414",
      borderRadius: 10,
      padding: "18px 20px",
      transition: "all 0.3s ease",
    },
    statLabel: {
      fontSize: 10,
      color: "#6B7280",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      marginBottom: 6,
    },
    statValue: { fontSize: 26, fontWeight: 800 as const, color: "#fff" },
    statSub: { fontSize: 11, color: "#4B5563", marginTop: 4 },
    section: { marginTop: 24 },
    sectionHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700 as const,
      color: "#9CA3AF",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
    },
    leaderboardRow: (isSelected: boolean, index: number) => ({
      display: "grid",
      gridTemplateColumns: "40px 1fr 140px 100px 80px",
      alignItems: "center",
      padding: "14px 16px",
      borderRadius: 10,
      background: isSelected ? "#111" : index % 2 === 0 ? "#0A0A0A" : "transparent",
      border: isSelected ? "1px solid #D97706" : "1px solid transparent",
      cursor: "pointer",
      transition: "all 0.2s ease",
      marginBottom: 2,
    }),
    rankNum: (i: number) => ({
      fontSize: 16,
      fontWeight: 800 as const,
      color: i === 0 ? "#D97706" : i === 1 ? "#9CA3AF" : i === 2 ? "#92400E" : "#4B5563",
    }),
    avatar: (color: string) => ({
      width: 36,
      height: 36,
      borderRadius: 8,
      background: `linear-gradient(135deg, ${color}33 0%, ${color}11 100%)`,
      border: `1px solid ${color}44`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700 as const,
      color,
    }),
    profileCard: {
      background: "#0A0A0A",
      border: "1px solid #141414",
      borderRadius: 14,
      padding: 28,
    },
    modelRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: "#0D0D0D",
      border: "1px solid #141414",
      borderRadius: 8,
      marginBottom: 6,
      fontSize: 12,
    },
    badgeSection: {
      background: "#0A0A0A",
      border: "1px solid #141414",
      borderRadius: 14,
      padding: 28,
      marginTop: 16,
    },
    codeBlock: {
      background: "#0D0D0D",
      border: "1px solid #1A1A1A",
      borderRadius: 8,
      padding: "14px 18px",
      fontSize: 12,
      color: "#9CA3AF",
      lineHeight: 1.6,
      overflowX: "auto" as const,
      marginTop: 12,
      fontFamily: "'JetBrains Mono', monospace",
    },
    timeframeBtn: (active: boolean) => ({
      padding: "5px 12px",
      borderRadius: 5,
      border: "none",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600 as const,
      fontFamily: "'JetBrains Mono', monospace",
      background: active ? "#1A1A1A" : "transparent",
      color: active ? "#D97706" : "#4B5563",
      transition: "all 0.2s",
    }),
  };

  if (!selectedUser) {
    return (
      <div style={styles.app}>
        <div style={styles.noise} />
        <div style={styles.glow} />
        <div style={styles.container}>
          <header style={styles.header}>
            <div style={styles.logo}>
              <div style={styles.logoMark}>B</div>
              <div>
                <div style={styles.logoText}>burnlog</div>
                <div style={styles.logoSub}>token burn tracker</div>
              </div>
            </div>
            <a
              href="/settings"
              style={{
                fontSize: 12,
                color: "#D97706",
                padding: "8px 14px",
                border: "1px solid #D9770644",
                borderRadius: 6,
              }}
            >
              Sign in
            </a>
          </header>
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
            <div style={{ fontSize: 20, color: "#fff", marginBottom: 8, fontWeight: 700 }}>
              No burns yet.
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 24 }}>
              Sign in, grab an API key, and run <code style={{ color: "#D97706" }}>burnlog sync</code> to light it up.
            </div>
            <a
              href="/settings"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "#D97706",
                color: "#000",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Get started →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const topModelMax = Math.max(...selectedUser.topModels.map((m) => m.tokens), 1);

  return (
    <div style={styles.app}>
      <div style={styles.noise} />
      <div style={styles.glow} />

      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoMark}>B</div>
            <div>
              <div style={styles.logoText}>burnlog</div>
              <div style={styles.logoSub}>token burn tracker</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <nav style={styles.nav}>
              {(
                [
                  ["leaderboard", "Leaderboard"],
                  ["profile", "Profile"],
                  ["badges", "Badges"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} style={styles.navBtn(tab === key)} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </nav>
            <a
              href="/settings"
              style={{
                fontSize: 11,
                color: currentUsername ? "#9CA3AF" : "#D97706",
                padding: "8px 12px",
                border: "1px solid #1F1F1F",
                borderRadius: 6,
              }}
            >
              {currentUsername ? `@${currentUsername}` : "Sign in"}
            </a>
          </div>
        </header>

        {/* Hero Stats */}
        <div style={styles.heroStats}>
          {[
            { label: "Total Burned", value: globalStats.totalBurned, sub: "across all users" },
            { label: "This Week", value: globalStats.weeklyTotal, sub: "last 7 days" },
            { label: "Active Burners", value: globalStats.activeUsers, sub: "competing now" },
            { label: "Avg / User", value: globalStats.avgPerUser, sub: "all-time average" },
          ].map((s, i) => (
            <div key={i} style={styles.statCard}>
              <div style={styles.statLabel}>{s.label}</div>
              <div style={styles.statValue}>
                {mounted ? <AnimCount value={s.value} /> : formatTokens(s.value)}
              </div>
              <div style={styles.statSub}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Leaderboard</div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "#0A0A0A",
                  borderRadius: 6,
                  padding: 2,
                }}
              >
                {(["all-time", "weekly"] as const).map((t) => (
                  <button
                    key={t}
                    style={styles.timeframeBtn(timeframe === t)}
                    onClick={() => setTimeframe(t)}
                  >
                    {t === "all-time" ? "All Time" : "Weekly"}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 140px 100px 80px",
                padding: "0 16px 8px",
                fontSize: 10,
                color: "#4B5563",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              <span>#</span>
              <span>User</span>
              <span>Trend</span>
              <span>Tokens</span>
              <span>Rank</span>
            </div>

            {sortedUsers.map((user, i) => {
              const r = getRank(user.totalTokens);
              const tokens = timeframe === "weekly" ? user.weeklyTokens : user.totalTokens;
              return (
                <div
                  key={user.id}
                  style={styles.leaderboardRow(selectedUser.id === user.id, i)}
                  onClick={() => {
                    setSelectedUser(user);
                    setTab("profile");
                  }}
                >
                  <span style={styles.rankNum(i)}>{i + 1}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={styles.avatar(r.color)}>{user.avatar}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "#4B5563" }}>@{user.username}</div>
                    </div>
                  </div>
                  <div>
                    <Sparkline data={user.weeklyHistory} color={r.color} width={110} height={28} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {formatTokens(tokens)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: r.color,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {r.icon} {r.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PROFILE TAB */}
        {tab === "profile" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Profile · @{selectedUser.username}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{
                      ...styles.avatar(getRank(u.totalTokens).color),
                      cursor: "pointer",
                      border:
                        selectedUser.id === u.id
                          ? `2px solid ${getRank(u.totalTokens).color}`
                          : `1px solid ${getRank(u.totalTokens).color}33`,
                      width: 32,
                      height: 32,
                      fontSize: 10,
                    }}
                  >
                    {u.avatar}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.profileCard}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24 }}>
                <div
                  style={{
                    ...styles.avatar(rank.color),
                    width: 64,
                    height: 64,
                    fontSize: 22,
                    borderRadius: 12,
                  }}
                >
                  {selectedUser.avatar}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}
                  >
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                      {selectedUser.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: rank.color,
                        background: `${rank.color}15`,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${rank.color}33`,
                      }}
                    >
                      {rank.icon} {rank.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
                    @{selectedUser.username}
                  </div>
                  <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                    {selectedUser.bio ?? "—"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                  padding: "20px 0",
                  borderTop: "1px solid #141414",
                  borderBottom: "1px solid #141414",
                  marginBottom: 20,
                }}
              >
                {[
                  { label: "Total Burned", value: formatTokens(selectedUser.totalTokens) },
                  { label: "This Week", value: formatTokens(selectedUser.weeklyTokens) },
                  { label: "Streak", value: `${selectedUser.streak} days` },
                  { label: "Tok/Req", value: selectedUser.tokensPerCommit.toLocaleString() },
                ].map((s, i) => (
                  <div key={i}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#4B5563",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {s.label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Sources strip */}
              {selectedUser.sources.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6B7280",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Sources
                  </div>
                  <SourcesStrip sources={selectedUser.sources} />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6B7280",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Weekly Burn
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
                    {selectedUser.weeklyHistory.map((v, i) => {
                      const max = Math.max(...selectedUser.weeklyHistory, 1);
                      const h = (v / max) * 90;
                      return (
                        <div key={i} style={{ flex: 1, textAlign: "center" }}>
                          <div
                            style={{
                              height: h,
                              background:
                                i === 6
                                  ? `linear-gradient(180deg, ${rank.color} 0%, ${rank.color}44 100%)`
                                  : "#1A1A1A",
                              borderRadius: "4px 4px 0 0",
                              transition: "height 0.5s ease",
                              marginBottom: 6,
                            }}
                          />
                          <div style={{ fontSize: 9, color: "#4B5563" }}>{DAYS[i]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6B7280",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Provider Split
                  </div>
                  <ProviderBar providers={selectedUser.providers} />
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#4B5563",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      Top Models
                    </div>
                    {selectedUser.topModels.length === 0 ? (
                      <div style={{ fontSize: 11, color: "#4B5563" }}>—</div>
                    ) : (
                      selectedUser.topModels.map((m) => (
                        <div key={m.model} style={styles.modelRow}>
                          <span style={{ color: "#fff", fontWeight: 600 }}>{m.model}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 60,
                                height: 4,
                                background: "#141414",
                                borderRadius: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${(m.tokens / topModelMax) * 100}%`,
                                  height: "100%",
                                  background: rank.color,
                                }}
                              />
                            </div>
                            <span style={{ color: "#D97706", fontWeight: 700 }}>
                              {formatTokens(m.tokens)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Activity Heatmap — full-width */}
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #141414" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6B7280",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Burn Activity · 12 Weeks
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#4B5563" }}>
                    <span>less</span>
                    {[0.12, 0.28, 0.45, 0.7, 1].map((a) => (
                      <span
                        key={a}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: `rgba(217,119,6,${a})`,
                          display: "inline-block",
                        }}
                      />
                    ))}
                    <span>more</span>
                  </div>
                </div>
                <ActivityHeatmap heatmap={selectedUser.heatmap} />
              </div>
            </div>
          </div>
        )}

        {/* BADGES TAB */}
        {tab === "badges" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Embed Badges</div>
            </div>

            <div style={styles.badgeSection}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
                README Badge
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>
                Add your burn stats to any GitHub profile or repo README.
              </div>

              <RankBadgePreview user={selectedUser} />

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 6 }}>Markdown</div>
                {`[![burnlog](https://burnlog.dev/badge/${selectedUser.username}.svg)](https://burnlog.dev/u/${selectedUser.username})`}
              </div>

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#4B5563", marginBottom: 6 }}>HTML</div>
                {`<a href="https://burnlog.dev/u/${selectedUser.username}"><img src="https://burnlog.dev/badge/${selectedUser.username}.svg" alt="burnlog" /></a>`}
              </div>
            </div>

            <div style={{ ...styles.badgeSection, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
                Rank System
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 20 }}>
                Your rank evolves as you burn more tokens.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {RANKS.map((r) => {
                  const isActive = getRank(selectedUser.totalTokens).name === r.name;
                  return (
                    <div
                      key={r.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "12px 16px",
                        borderRadius: 8,
                        background: isActive ? `${r.color}10` : "#0D0D0D",
                        border: isActive ? `1px solid ${r.color}44` : "1px solid #141414",
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: 22, width: 32, textAlign: "center" }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: isActive ? r.color : "#6B7280",
                          }}
                        >
                          {r.name}
                          {isActive && (
                            <span
                              style={{
                                fontSize: 10,
                                marginLeft: 8,
                                color: r.color,
                                background: `${r.color}20`,
                                padding: "2px 8px",
                                borderRadius: 3,
                              }}
                            >
                              CURRENT
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#4B5563", marginTop: 2 }}>
                          {r.max === Number.POSITIVE_INFINITY
                            ? `${formatTokens(r.min)}+ tokens`
                            : `${formatTokens(r.min)} – ${formatTokens(r.max)} tokens`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer
          style={{
            padding: "32px 0",
            marginTop: 40,
            borderTop: "1px solid #141414",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "#4B5563",
          }}
        >
          <span>burnlog · private · v1</span>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/settings">Settings</a>
            <span>CLI</span>
            <span>API</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

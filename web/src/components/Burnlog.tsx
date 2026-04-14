"use client";

import { useEffect, useRef, useState } from "react";
import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

// ---------- Mock data for gamification tabs ----------
type Club = {
  id: string;
  name: string;
  tag: string;
  tagline: string;
  members: string[]; // usernames
  totalBurned: number;
  weeklyBurned: number;
  minRank: string; // rank name floor for eligibility
  isPrivate: boolean;
};

type Challenge = {
  id: string;
  name: string;
  tagline: string;
  prize: string;
  endsAt: string;
  status: "active" | "completed";
  participants: { username: string; progress: number }[]; // progress = tokens in challenge
  target: number;
  winner?: string;
};

const CLUBS: Club[] = [
  {
    id: "c1",
    name: "Midnight Burners",
    tag: "MDN",
    tagline: "3am > 3pm",
    members: ["sharziki", "zara.dev", "codex_kai"],
    totalBurned: 412_000_000,
    weeklyBurned: 48_000_000,
    minRank: "Blaze",
    isPrivate: false,
  },
  {
    id: "c2",
    name: "Token Tycoons",
    tag: "TYC",
    tagline: "money is a language, we speak fluent burn",
    members: ["byte_marcus", "luna_build", "devraj_s"],
    totalBurned: 890_000_000,
    weeklyBurned: 102_000_000,
    minRank: "Inferno",
    isPrivate: true,
  },
  {
    id: "c3",
    name: "Rubber Duck Collective",
    tag: "RDC",
    tagline: "we ask the duck first, then claude",
    members: ["sharziki", "luna_build"],
    totalBurned: 156_000_000,
    weeklyBurned: 19_000_000,
    minRank: "Ember",
    isPrivate: false,
  },
  {
    id: "c4",
    name: "Inference Cartel",
    tag: "INF",
    tagline: "we don't sleep, the gpus do",
    members: ["zara.dev", "byte_marcus", "devraj_s", "codex_kai"],
    totalBurned: 1_240_000_000,
    weeklyBurned: 188_000_000,
    minRank: "Supernova",
    isPrivate: true,
  },
  {
    id: "c5",
    name: "Frontend First Responders",
    tag: "FFR",
    tagline: "tailwind or death",
    members: ["luna_build"],
    totalBurned: 74_000_000,
    weeklyBurned: 11_000_000,
    minRank: "Spark",
    isPrivate: false,
  },
];

const CHALLENGES: Challenge[] = [
  {
    id: "ch1",
    name: "Weekly Burn Sprint",
    tagline: "most tokens burned in 7 days wins",
    prize: "Custom rank flair + bragging rights",
    endsAt: "2026-04-20",
    status: "active",
    target: 100_000_000,
    participants: [
      { username: "sharziki", progress: 48_000_000 },
      { username: "zara.dev", progress: 62_000_000 },
      { username: "codex_kai", progress: 41_000_000 },
      { username: "byte_marcus", progress: 73_000_000 },
    ],
  },
  {
    id: "ch2",
    name: "Haiku Marathon",
    tagline: "who can squeeze the most out of Haiku 4.5",
    prize: "✦ Supernova badge preview for 7 days",
    endsAt: "2026-04-27",
    status: "active",
    target: 50_000_000,
    participants: [
      { username: "sharziki", progress: 12_000_000 },
      { username: "luna_build", progress: 31_000_000 },
      { username: "devraj_s", progress: 28_000_000 },
    ],
  },
  {
    id: "ch3",
    name: "Streak Duel",
    tagline: "longest consecutive-day burn streak",
    prize: "Club channel highlight",
    endsAt: "2026-05-04",
    status: "active",
    target: 30,
    participants: [
      { username: "sharziki", progress: 14 },
      { username: "codex_kai", progress: 22 },
      { username: "zara.dev", progress: 9 },
    ],
  },
  {
    id: "ch4",
    name: "March Madness Burn",
    tagline: "full-month cumulative burn battle",
    prize: "Pinned leaderboard mention · Mar 2026",
    endsAt: "2026-03-31",
    status: "completed",
    target: 300_000_000,
    winner: "byte_marcus",
    participants: [
      { username: "byte_marcus", progress: 312_000_000 },
      { username: "zara.dev", progress: 288_000_000 },
      { username: "sharziki", progress: 197_000_000 },
    ],
  },
];

// ---------- Mock peers (UserStats-shaped) for clubs/h2h since real DB may have 1 user ----------
function mkPeer(partial: {
  username: string;
  name: string;
  bio: string;
  totalTokens: number;
  weeklyTokens: number;
  streak: number;
  providers: UserStats["providers"];
  topModels: UserStats["topModels"];
  tokensPerCommit: number;
  commits: number;
  avatar: string;
}): UserStats {
  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const base = partial.weeklyTokens / 7;
    const noise = Math.sin((i + partial.username.length) * 1.7) * 0.5 + 0.5;
    const trend = (i / 84) * 0.4 + 0.6;
    return Math.floor(base * noise * trend);
  });
  const weeklyHistory = Array.from({ length: 7 }, (_, i) => {
    const base = partial.weeklyTokens / 7;
    const noise = Math.sin((i + partial.username.length) * 2.3) * 0.35 + 0.65;
    return Math.floor(base * noise);
  });
  return {
    id: `mock-${partial.username}`,
    username: partial.username,
    name: partial.name,
    avatar: partial.avatar,
    bio: partial.bio,
    totalTokens: partial.totalTokens,
    weeklyTokens: partial.weeklyTokens,
    streak: partial.streak,
    providers: partial.providers,
    sources: [
      { source: "claude-code", tokens: Math.floor(partial.totalTokens * 0.7) },
      { source: "codex", tokens: Math.floor(partial.totalTokens * 0.3) },
    ],
    topModels: partial.topModels,
    weeklyHistory,
    heatmap,
    tokensPerCommit: partial.tokensPerCommit,
    commits: partial.commits,
  };
}

const MOCK_PEERS: UserStats[] = [
  mkPeer({
    username: "zara.dev",
    name: "Zara",
    bio: "shipping prod from a kitchen counter",
    totalTokens: 184_000_000,
    weeklyTokens: 22_000_000,
    streak: 19,
    providers: { anthropic: 0.72, openai: 0.2, google: 0.05, other: 0.03 },
    topModels: [
      { model: "claude-opus-4-6", tokens: 92_000_000 },
      { model: "claude-sonnet-4-6", tokens: 48_000_000 },
      { model: "gpt-5", tokens: 22_000_000 },
    ],
    tokensPerCommit: 14_200,
    commits: 12_950,
    avatar: "ZA",
  }),
  mkPeer({
    username: "codex_kai",
    name: "Kai",
    bio: "codex cli lifer",
    totalTokens: 126_000_000,
    weeklyTokens: 16_500_000,
    streak: 31,
    providers: { anthropic: 0.12, openai: 0.83, google: 0.03, other: 0.02 },
    topModels: [
      { model: "gpt-5", tokens: 71_000_000 },
      { model: "gpt-5-mini", tokens: 34_000_000 },
      { model: "o4-mini", tokens: 12_000_000 },
    ],
    tokensPerCommit: 9_800,
    commits: 12_850,
    avatar: "KA",
  }),
  mkPeer({
    username: "byte_marcus",
    name: "Marcus",
    bio: "refactoring legacy at 3am",
    totalTokens: 412_000_000,
    weeklyTokens: 54_000_000,
    streak: 47,
    providers: { anthropic: 0.58, openai: 0.32, google: 0.08, other: 0.02 },
    topModels: [
      { model: "claude-opus-4-6", tokens: 188_000_000 },
      { model: "gpt-5", tokens: 96_000_000 },
      { model: "claude-sonnet-4-6", tokens: 72_000_000 },
    ],
    tokensPerCommit: 18_400,
    commits: 22_390,
    avatar: "MA",
  }),
  mkPeer({
    username: "luna_build",
    name: "Luna",
    bio: "frontend framework of the week enthusiast",
    totalTokens: 68_000_000,
    weeklyTokens: 9_200_000,
    streak: 8,
    providers: { anthropic: 0.82, openai: 0.1, google: 0.05, other: 0.03 },
    topModels: [
      { model: "claude-sonnet-4-6", tokens: 41_000_000 },
      { model: "claude-haiku-4-5", tokens: 19_000_000 },
    ],
    tokensPerCommit: 7_100,
    commits: 9_580,
    avatar: "LU",
  }),
  mkPeer({
    username: "devraj_s",
    name: "Devraj",
    bio: "infra > ui",
    totalTokens: 298_000_000,
    weeklyTokens: 38_000_000,
    streak: 24,
    providers: { anthropic: 0.45, openai: 0.4, google: 0.12, other: 0.03 },
    topModels: [
      { model: "claude-opus-4-6", tokens: 128_000_000 },
      { model: "gpt-5", tokens: 96_000_000 },
      { model: "gemini-2.5-pro", tokens: 42_000_000 },
    ],
    tokensPerCommit: 16_800,
    commits: 17_730,
    avatar: "DE",
  }),
];

function resolvePeer(username: string, users: UserStats[]): UserStats | null {
  return (
    users.find((u) => u.username === username) ??
    MOCK_PEERS.find((u) => u.username === username) ??
    null
  );
}

type Metric = {
  label: string;
  left: number;
  right: number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
};

function buildMetrics(l: UserStats, r: UserStats): Metric[] {
  return [
    {
      label: "Total Tokens",
      left: l.totalTokens,
      right: r.totalTokens,
      format: (v) => formatTokens(v),
    },
    {
      label: "Weekly Tokens",
      left: l.weeklyTokens,
      right: r.weeklyTokens,
      format: (v) => formatTokens(v),
    },
    {
      label: "Streak",
      left: l.streak,
      right: r.streak,
      format: (v) => `${v}d`,
    },
    {
      label: "Tok / Commit",
      left: l.tokensPerCommit,
      right: r.tokensPerCommit,
      format: (v) => v.toLocaleString(),
      lowerIsBetter: true,
    },
    {
      label: "Est. Spend",
      left: l.totalTokens * DOLLARS_PER_TOKEN,
      right: r.totalTokens * DOLLARS_PER_TOKEN,
      format: (v) => formatUSD(v),
    },
  ];
}

function countWins(metrics: Metric[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const m of metrics) {
    const leftBetter = m.lowerIsBetter ? m.left < m.right : m.left > m.right;
    const rightBetter = m.lowerIsBetter ? m.right < m.left : m.right > m.left;
    if (leftBetter) left++;
    else if (rightBetter) right++;
  }
  return { left, right };
}

function estSpend(tokens: number): number {
  return tokens * DOLLARS_PER_TOKEN;
}

function formatUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

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
  color = "#FAFAFA",
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
    other: "#52525B",
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
          background: "#18181B",
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
            style={{ fontSize: 11, color: "#52525B", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
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
            background: "#0F0F11",
            border: "1px solid #18181B",
            borderRadius: 6,
            fontSize: 11,
            color: "#52525B",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: MONO,
          }}
        >
          <span style={{ color: "#D97706", fontWeight: 700 }}>{SOURCE_LABELS[s.source] ?? s.source}</span>
          <span style={{ color: "#3F3F46" }}>·</span>
          <span style={{ color: "#FAFAFA" }}>{formatTokens(s.tokens)}</span>
          <span style={{ color: "#3F3F46" }}>({Math.round((s.tokens / total) * 100)}%)</span>
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
        background: "#0F0F11",
        border: "1px solid #18181B",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: MONO,
        width: "fit-content",
      }}
    >
      <span style={{ fontSize: 18, color: rank.color }}>{rank.icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1 }}>BURNLOG</div>
        <div style={{ fontSize: 14, color: rank.color, fontWeight: 700 }}>
          {rank.name} · {formatTokens(user.totalTokens)} tokens
        </div>
      </div>
      <span style={{ fontSize: 12, color: "#3F3F46", marginLeft: 8 }}>@{user.username}</span>
    </div>
  );
}

// --- Activity Heatmap (real data, full-width) ---
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

// ---------- Modal shell ----------
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0C0C0E",
          border: "1px solid #18181B",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 480,
          fontFamily: SANS,
          color: "#E4E4E7",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#52525B",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Input / button helpers ----------
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0F0F11",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: "#E4E4E7",
  fontFamily: MONO,
  outline: "none",
  transition: "border-color 0.15s ease",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "#D97706",
  color: "#09090B",
  border: "none",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: MONO,
  letterSpacing: 0.5,
  cursor: "pointer",
  textTransform: "uppercase",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "transparent",
  color: "#E4E4E7",
  border: "1px solid #18181B",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: MONO,
  letterSpacing: 0.5,
  cursor: "pointer",
  textTransform: "uppercase",
};

// ---------- Peer selector dropdown (H2H) ----------
function PeerDropdown({
  options,
  value,
  open,
  onToggle,
  onSelect,
}: {
  options: UserStats[];
  value: UserStats;
  open: boolean;
  onToggle: () => void;
  onSelect: (u: UserStats) => void;
}) {
  const rank = getRank(value.totalTokens);
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "#0F0F11",
          border: "1px solid #18181B",
          borderRadius: 8,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          fontFamily: MONO,
          color: "#E4E4E7",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${rank.color}33 0%, ${rank.color}11 100%)`,
            border: `1px solid ${rank.color}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: rank.color,
          }}
        >
          {value.avatar}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FAFAFA" }}>{value.name}</div>
          <div style={{ fontSize: 11, color: "#52525B" }}>@{value.username}</div>
        </div>
        <span style={{ color: "#52525B", fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#0C0C0E",
            border: "1px solid #18181B",
            borderRadius: 8,
            padding: 4,
            zIndex: 10,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {options.map((u) => {
            const r = getRank(u.totalTokens);
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u)}
                style={{
                  width: "100%",
                  background: u.id === value.id ? "#18181B" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontFamily: MONO,
                  color: "#E4E4E7",
                  textAlign: "left",
                }}
              >
                <span style={{ color: r.color, fontSize: 14, width: 18 }}>{r.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#FAFAFA" }}>
                  {u.name}
                </span>
                <span style={{ fontSize: 10, color: "#52525B" }}>@{u.username}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#52525B" }}>
                  {formatTokens(u.totalTokens)}
                </span>
              </button>
            );
          })}
        </div>
      )}
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
  const [tab, setTab] = useState<
    "leaderboard" | "clubs" | "challenges" | "h2h" | "profile" | "badges"
  >("leaderboard");
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(users[0] ?? null);
  const [timeframe, setTimeframe] = useState<"all-time" | "weekly">("all-time");
  const [mounted, setMounted] = useState(false);

  // H2H state
  const allPeers: UserStats[] = [...users, ...MOCK_PEERS.filter((m) => !users.some((u) => u.username === m.username))];
  const [h2hLeft, setH2hLeft] = useState<UserStats>(users[0] ?? MOCK_PEERS[0]);
  const [h2hRight, setH2hRight] = useState<UserStats>(
    resolvePeer("zara.dev", users) ?? MOCK_PEERS[0],
  );
  const [h2hLeftOpen, setH2hLeftOpen] = useState(false);
  const [h2hRightOpen, setH2hRightOpen] = useState(false);

  // Modals
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [challengePrefill, setChallengePrefill] = useState<string>("");

  // Copy-to-clip feedback
  const [copied, setCopied] = useState<string | null>(null);
  const copyToClip = (key: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

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
      fontFamily: SANS,
      background: "#09090B",
      color: "#E4E4E7",
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
      borderBottom: "1px solid #18181B",
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
      color: "#09090B",
    },
    logoText: { fontSize: 18, fontWeight: 700 as const, color: "#FAFAFA", letterSpacing: -0.5 },
    logoSub: {
      fontSize: 10,
      color: "#52525B",
      letterSpacing: 2,
      textTransform: "uppercase" as const,
      marginTop: 2,
      fontFamily: MONO,
    },
    nav: {
      display: "flex",
      gap: 2,
      background: "#0C0C0E",
      borderRadius: 8,
      padding: 3,
      border: "1px solid #18181B",
    },
    navBtn: (active: boolean) => ({
      padding: "8px 14px",
      borderRadius: 6,
      border: "none",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600 as const,
      fontFamily: MONO,
      letterSpacing: 0.5,
      background: active ? "#18181B" : "transparent",
      color: active ? "#D97706" : "#52525B",
      transition: "all 0.2s ease",
    }),
    heroStats: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      padding: "28px 0",
    },
    statCard: {
      background: "#0C0C0E",
      border: "1px solid #18181B",
      borderRadius: 10,
      padding: "18px 20px",
      transition: "all 0.3s ease",
    },
    statLabel: {
      fontSize: 10,
      color: "#52525B",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      marginBottom: 6,
      fontFamily: MONO,
    },
    statValue: { fontSize: 26, fontWeight: 800 as const, color: "#FAFAFA", fontFamily: MONO },
    statSub: { fontSize: 11, color: "#3F3F46", marginTop: 4, fontFamily: MONO },
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
      color: "#E4E4E7",
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      fontFamily: MONO,
    },
    leaderboardRow: (isSelected: boolean, index: number) => ({
      display: "grid",
      gridTemplateColumns: "40px 1fr 140px 100px 80px",
      alignItems: "center",
      padding: "14px 16px",
      borderRadius: 10,
      background: isSelected ? "#111113" : index % 2 === 0 ? "#0C0C0E" : "transparent",
      border: isSelected ? "1px solid #D97706" : "1px solid transparent",
      cursor: "pointer",
      transition: "all 0.2s ease",
      marginBottom: 2,
    }),
    rankNum: (i: number) => ({
      fontSize: 16,
      fontWeight: 800 as const,
      color: i === 0 ? "#D97706" : i === 1 ? "#E4E4E7" : i === 2 ? "#92400E" : "#3F3F46",
      fontFamily: MONO,
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
      fontFamily: MONO,
    }),
    profileCard: {
      background: "#0C0C0E",
      border: "1px solid #18181B",
      borderRadius: 14,
      padding: 28,
    },
    modelRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: "#0F0F11",
      border: "1px solid #18181B",
      borderRadius: 8,
      marginBottom: 6,
      fontSize: 12,
      fontFamily: MONO,
    },
    badgeSection: {
      background: "#0C0C0E",
      border: "1px solid #18181B",
      borderRadius: 14,
      padding: 28,
      marginTop: 16,
    },
    codeBlock: {
      background: "#0F0F11",
      border: "1px solid #18181B",
      borderRadius: 8,
      padding: "14px 18px",
      fontSize: 12,
      color: "#E4E4E7",
      lineHeight: 1.6,
      overflowX: "auto" as const,
      marginTop: 12,
      fontFamily: MONO,
    },
    timeframeBtn: (active: boolean) => ({
      padding: "5px 12px",
      borderRadius: 5,
      border: "none",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600 as const,
      fontFamily: MONO,
      background: active ? "#18181B" : "transparent",
      color: active ? "#D97706" : "#3F3F46",
      transition: "all 0.2s",
    }),
    // Card used by clubs/challenges
    card: {
      background: "#0C0C0E",
      border: "1px solid #18181B",
      borderRadius: 12,
      padding: 20,
    },
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
                fontFamily: MONO,
              }}
            >
              Sign in
            </a>
          </header>
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16, color: "#D97706" }}>✦</div>
            <div style={{ fontSize: 20, color: "#FAFAFA", marginBottom: 8, fontWeight: 700 }}>
              No burns yet.
            </div>
            <div style={{ fontSize: 13, color: "#52525B", marginBottom: 24, fontFamily: MONO }}>
              Sign in, grab an API key, and run <code style={{ color: "#D97706" }}>burnlog sync</code> to light it up.
            </div>
            <a
              href="/settings"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "#D97706",
                color: "#09090B",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: MONO,
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

  // Clubs derived data
  const myClubs = CLUBS.filter((c) => c.members.includes(selectedUser.username));
  const discoverClubs = CLUBS.filter((c) => !c.members.includes(selectedUser.username));
  const sortedClubs = [...CLUBS].sort((a, b) => b.totalBurned - a.totalBurned);
  const myRankName = getRank(selectedUser.totalTokens).name;
  const myRankIdx = RANKS.findIndex((r) => r.name === myRankName);
  const clubEligible = (c: Club) => {
    const need = RANKS.findIndex((r) => r.name === c.minRank);
    return myRankIdx >= need;
  };

  // H2H metrics
  const h2hMetrics = buildMetrics(h2hLeft, h2hRight);
  const h2hWins = countWins(h2hMetrics);

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
                  ["leaderboard", "Board"],
                  ["clubs", "Clubs"],
                  ["challenges", "Challenges"],
                  ["h2h", "H2H"],
                  ["profile", "Profile"],
                  ["badges", "Embed"],
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
                color: currentUsername ? "#E4E4E7" : "#D97706",
                padding: "8px 12px",
                border: "1px solid #18181B",
                borderRadius: 6,
                fontFamily: MONO,
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
                  background: "#0C0C0E",
                  borderRadius: 6,
                  padding: 2,
                  border: "1px solid #18181B",
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
                color: "#3F3F46",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: MONO,
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>@{user.username}</div>
                    </div>
                  </div>
                  <div>
                    <Sparkline data={user.weeklyHistory} color={r.color} width={110} height={28} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA", fontFamily: MONO }}>
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
                      fontFamily: MONO,
                    }}
                  >
                    {r.icon} {r.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CLUBS TAB */}
        {tab === "clubs" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Clubs</div>
              <button style={primaryBtn} onClick={() => setCreateClubOpen(true)}>
                + Create Club
              </button>
            </div>

            {/* Club leaderboard */}
            <div style={{ ...styles.card, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#52525B",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontFamily: MONO,
                  marginBottom: 14,
                }}
              >
                Club Leaderboard
              </div>
              {sortedClubs.map((club, i) => (
                <div
                  key={club.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 120px 100px",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: i % 2 === 0 ? "#0F0F11" : "transparent",
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: i === 0 ? "#D97706" : i === 1 ? "#E4E4E7" : i === 2 ? "#92400E" : "#3F3F46",
                      fontFamily: MONO,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#FAFAFA" }}>{club.name}</span>
                      <span
                        style={{
                          fontSize: 9,
                          color: "#52525B",
                          padding: "2px 6px",
                          border: "1px solid #18181B",
                          borderRadius: 3,
                          fontFamily: MONO,
                          letterSpacing: 0.5,
                        }}
                      >
                        {club.tag}
                      </span>
                      {club.isPrivate && (
                        <span style={{ fontSize: 9, color: "#3F3F46", fontFamily: MONO }}>PRIVATE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#52525B", marginTop: 2 }}>{club.tagline}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#E4E4E7", fontFamily: MONO }}>
                    {club.members.length} members
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#D97706", fontFamily: MONO, textAlign: "right" }}>
                    {formatTokens(club.totalBurned)}
                  </div>
                </div>
              ))}
            </div>

            {/* My Clubs */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#52525B",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontFamily: MONO,
                  marginBottom: 12,
                }}
              >
                My Clubs
              </div>
              {myClubs.length === 0 ? (
                <div
                  style={{
                    ...styles.card,
                    textAlign: "center",
                    padding: 32,
                    fontSize: 12,
                    color: "#52525B",
                    fontFamily: MONO,
                  }}
                >
                  You haven't joined any clubs yet. Scroll down to discover some.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {myClubs.map((club) => (
                    <div key={club.id} style={styles.card}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA" }}>{club.name}</span>
                          <span
                            style={{
                              fontSize: 9,
                              color: "#D97706",
                              padding: "2px 6px",
                              border: "1px solid #D9770644",
                              borderRadius: 3,
                              fontFamily: MONO,
                            }}
                          >
                            {club.tag}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: "#10B981", fontFamily: MONO }}>● MEMBER</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#52525B", marginBottom: 12 }}>{club.tagline}</div>
                      <div style={{ display: "flex", gap: 16, fontFamily: MONO }}>
                        <div>
                          <div style={{ fontSize: 9, color: "#3F3F46", letterSpacing: 1 }}>TOTAL</div>
                          <div style={{ fontSize: 13, color: "#FAFAFA", fontWeight: 700 }}>
                            {formatTokens(club.totalBurned)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: "#3F3F46", letterSpacing: 1 }}>WEEKLY</div>
                          <div style={{ fontSize: 13, color: "#D97706", fontWeight: 700 }}>
                            {formatTokens(club.weeklyBurned)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: "#3F3F46", letterSpacing: 1 }}>MEMBERS</div>
                          <div style={{ fontSize: 13, color: "#E4E4E7", fontWeight: 700 }}>
                            {club.members.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discover Clubs */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#52525B",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontFamily: MONO,
                  marginBottom: 12,
                }}
              >
                Discover Clubs
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {discoverClubs.map((club) => {
                  const eligible = clubEligible(club);
                  return (
                    <div key={club.id} style={styles.card}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA" }}>{club.name}</span>
                          <span
                            style={{
                              fontSize: 9,
                              color: "#52525B",
                              padding: "2px 6px",
                              border: "1px solid #18181B",
                              borderRadius: 3,
                              fontFamily: MONO,
                            }}
                          >
                            {club.tag}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            color: eligible ? "#10B981" : "#3F3F46",
                            fontFamily: MONO,
                          }}
                        >
                          {eligible ? "● ELIGIBLE" : "○ NOT ELIGIBLE"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#52525B", marginBottom: 12 }}>{club.tagline}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO }}>
                          {formatTokens(club.totalBurned)} · min {club.minRank}
                        </div>
                        <button
                          disabled={!eligible}
                          style={{
                            ...ghostBtn,
                            padding: "6px 12px",
                            fontSize: 10,
                            opacity: eligible ? 1 : 0.4,
                            cursor: eligible ? "pointer" : "not-allowed",
                            color: eligible ? "#D97706" : "#3F3F46",
                            borderColor: eligible ? "#D9770644" : "#18181B",
                          }}
                        >
                          {club.isPrivate ? "Invite Only" : "Join"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CHALLENGES TAB */}
        {tab === "challenges" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Challenges</div>
              <button
                style={primaryBtn}
                onClick={() => {
                  setChallengePrefill("");
                  setCreateChallengeOpen(true);
                }}
              >
                + Create Challenge
              </button>
            </div>

            {/* Active */}
            <div
              style={{
                fontSize: 11,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: MONO,
                marginBottom: 12,
              }}
            >
              Active
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {CHALLENGES.filter((c) => c.status === "active").map((ch) => {
                const shareLink = `https://burnlog.dev/c/${ch.id}`;
                const shareKey = `share-${ch.id}`;
                const maxProgress = Math.max(...ch.participants.map((p) => p.progress), ch.target);
                return (
                  <div key={ch.id} style={styles.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA" }}>{ch.name}</div>
                      <span style={{ fontSize: 9, color: "#10B981", fontFamily: MONO }}>● ACTIVE</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#52525B", marginBottom: 14 }}>{ch.tagline}</div>

                    <div style={{ marginBottom: 14 }}>
                      {[...ch.participants]
                        .sort((a, b) => b.progress - a.progress)
                        .map((p, i) => {
                          const pct = Math.min((p.progress / maxProgress) * 100, 100);
                          const isMe = p.username === selectedUser.username;
                          return (
                            <div key={p.username} style={{ marginBottom: 8 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 11,
                                  marginBottom: 4,
                                  fontFamily: MONO,
                                }}
                              >
                                <span style={{ color: isMe ? "#D97706" : "#E4E4E7" }}>
                                  {i + 1}. @{p.username}
                                  {isMe && " (you)"}
                                </span>
                                <span style={{ color: "#FAFAFA", fontWeight: 700 }}>
                                  {ch.target < 100
                                    ? `${p.progress}/${ch.target}d`
                                    : formatTokens(p.progress)}
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 4,
                                  background: "#18181B",
                                  borderRadius: 2,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${pct}%`,
                                    background: isMe ? "#D97706" : "#52525B",
                                    transition: "width 0.5s ease",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <div
                      style={{
                        padding: "10px 12px",
                        background: "#0F0F11",
                        border: "1px solid #18181B",
                        borderRadius: 6,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 9, color: "#3F3F46", letterSpacing: 1, marginBottom: 2, fontFamily: MONO }}>
                        PRIZE
                      </div>
                      <div style={{ fontSize: 11, color: "#D97706", fontWeight: 700, fontFamily: MONO }}>
                        {ch.prize}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>
                        Ends {ch.endsAt}
                      </div>
                      <button
                        onClick={() => copyToClip(shareKey, shareLink)}
                        style={{
                          ...ghostBtn,
                          padding: "6px 12px",
                          fontSize: 10,
                          color: copied === shareKey ? "#10B981" : "#E4E4E7",
                          borderColor: copied === shareKey ? "#10B98144" : "#18181B",
                        }}
                      >
                        {copied === shareKey ? "✓ Copied" : "Share Link"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Completed */}
            <div
              style={{
                fontSize: 11,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: MONO,
                marginBottom: 12,
              }}
            >
              Completed
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {CHALLENGES.filter((c) => c.status === "completed").map((ch) => (
                <div key={ch.id} style={{ ...styles.card, opacity: 0.65 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#E4E4E7" }}>{ch.name}</div>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#D97706",
                        padding: "2px 8px",
                        border: "1px solid #D9770644",
                        borderRadius: 3,
                        fontFamily: MONO,
                      }}
                    >
                      ✦ WINNER · @{ch.winner}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#52525B", marginBottom: 10 }}>{ch.tagline}</div>
                  <div style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO }}>Ended {ch.endsAt}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* H2H TAB */}
        {tab === "h2h" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Head-to-Head</div>
              <button
                style={primaryBtn}
                onClick={() => {
                  setChallengePrefill(`${h2hLeft.username} vs ${h2hRight.username}`);
                  setCreateChallengeOpen(true);
                }}
              >
                Challenge Them
              </button>
            </div>

            {/* Matchup selector */}
            <div
              style={{
                ...styles.card,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: 16,
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <PeerDropdown
                options={allPeers}
                value={h2hLeft}
                open={h2hLeftOpen}
                onToggle={() => {
                  setH2hLeftOpen(!h2hLeftOpen);
                  setH2hRightOpen(false);
                }}
                onSelect={(u) => {
                  setH2hLeft(u);
                  setH2hLeftOpen(false);
                }}
              />
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#D97706",
                  fontFamily: MONO,
                  padding: "0 8px",
                }}
              >
                VS
              </div>
              <PeerDropdown
                options={allPeers}
                value={h2hRight}
                open={h2hRightOpen}
                onToggle={() => {
                  setH2hRightOpen(!h2hRightOpen);
                  setH2hLeftOpen(false);
                }}
                onSelect={(u) => {
                  setH2hRight(u);
                  setH2hRightOpen(false);
                }}
              />
            </div>

            {/* Score summary */}
            <div
              style={{
                ...styles.card,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 24,
                marginBottom: 20,
                padding: 24,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#3F3F46", letterSpacing: 1, fontFamily: MONO }}>
                  @{h2hLeft.username}
                </div>
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    color: h2hWins.left > h2hWins.right ? "#D97706" : "#3F3F46",
                    fontFamily: MONO,
                    lineHeight: 1,
                  }}
                >
                  {h2hWins.left}
                </div>
              </div>
              <div style={{ fontSize: 24, color: "#18181B", fontFamily: MONO }}>—</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#3F3F46", letterSpacing: 1, fontFamily: MONO }}>
                  @{h2hRight.username}
                </div>
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    color: h2hWins.right > h2hWins.left ? "#D97706" : "#3F3F46",
                    fontFamily: MONO,
                    lineHeight: 1,
                  }}
                >
                  {h2hWins.right}
                </div>
              </div>
            </div>

            {/* Metric rows */}
            <div style={{ ...styles.card, marginBottom: 20 }}>
              {h2hMetrics.map((m) => {
                const leftWin = m.lowerIsBetter ? m.left < m.right : m.left > m.right;
                const rightWin = m.lowerIsBetter ? m.right < m.left : m.right > m.left;
                return (
                  <div
                    key={m.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px 1fr",
                      alignItems: "center",
                      padding: "14px 0",
                      borderBottom: "1px solid #18181B",
                      fontFamily: MONO,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: leftWin ? "#D97706" : "#52525B",
                        textAlign: "right",
                        paddingRight: 16,
                      }}
                    >
                      {m.format(m.left)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#3F3F46",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        textAlign: "center",
                      }}
                    >
                      {m.label}
                      {m.lowerIsBetter && (
                        <div style={{ fontSize: 8, color: "#3F3F46" }}>(lower is better)</div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: rightWin ? "#D97706" : "#52525B",
                        textAlign: "left",
                        paddingLeft: 16,
                      }}
                    >
                      {m.format(m.right)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Provider breakdown side-by-side */}
            <div
              style={{
                ...styles.card,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 24,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#3F3F46",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 10,
                    fontFamily: MONO,
                  }}
                >
                  @{h2hLeft.username} · providers
                </div>
                <ProviderBar providers={h2hLeft.providers} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#3F3F46",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 10,
                    fontFamily: MONO,
                  }}
                >
                  @{h2hRight.username} · providers
                </div>
                <ProviderBar providers={h2hRight.providers} />
              </div>
            </div>
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
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#FAFAFA" }}>
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
                        fontFamily: MONO,
                      }}
                    >
                      {rank.icon} {rank.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#52525B", marginBottom: 8, fontFamily: MONO }}>
                    @{selectedUser.username}
                  </div>
                  <div style={{ fontSize: 13, color: "#E4E4E7" }}>
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
                  borderTop: "1px solid #18181B",
                  borderBottom: "1px solid #18181B",
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
                        color: "#3F3F46",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        marginBottom: 4,
                        fontFamily: MONO,
                      }}
                    >
                      {s.label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#FAFAFA", fontFamily: MONO }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sources strip */}
              {selectedUser.sources.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#52525B",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontFamily: MONO,
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
                      color: "#52525B",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontFamily: MONO,
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
                                  : "#18181B",
                              borderRadius: "4px 4px 0 0",
                              transition: "height 0.5s ease",
                              marginBottom: 6,
                            }}
                          />
                          <div style={{ fontSize: 9, color: "#3F3F46", fontFamily: MONO }}>{DAYS[i]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#52525B",
                      marginBottom: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontFamily: MONO,
                    }}
                  >
                    Provider Split
                  </div>
                  <ProviderBar providers={selectedUser.providers} />
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#3F3F46",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        marginBottom: 8,
                        fontFamily: MONO,
                      }}
                    >
                      Top Models
                    </div>
                    {selectedUser.topModels.length === 0 ? (
                      <div style={{ fontSize: 11, color: "#3F3F46" }}>—</div>
                    ) : (
                      selectedUser.topModels.map((m) => (
                        <div key={m.model} style={styles.modelRow}>
                          <span style={{ color: "#FAFAFA", fontWeight: 600 }}>{m.model}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 60,
                                height: 4,
                                background: "#18181B",
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
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #18181B" }}>
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
                      color: "#52525B",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontFamily: MONO,
                    }}
                  >
                    Burn Activity · 12 Weeks
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#3F3F46", fontFamily: MONO }}>
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

        {/* BADGES / EMBED TAB */}
        {tab === "badges" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Embed Badges</div>
            </div>

            <div style={styles.badgeSection}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 6 }}>
                README Badge
              </div>
              <div style={{ fontSize: 12, color: "#52525B", marginBottom: 16, fontFamily: MONO }}>
                Add your burn stats to any GitHub profile or repo README.
              </div>

              <RankBadgePreview user={selectedUser} />

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#3F3F46", marginBottom: 6 }}>Markdown</div>
                {`[![burnlog](https://burnlog.dev/badge/${selectedUser.username}.svg)](https://burnlog.dev/u/${selectedUser.username})`}
              </div>

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#3F3F46", marginBottom: 6 }}>HTML</div>
                {`<a href="https://burnlog.dev/u/${selectedUser.username}"><img src="https://burnlog.dev/badge/${selectedUser.username}.svg" alt="burnlog" /></a>`}
              </div>
            </div>

            <div style={{ ...styles.badgeSection, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 6 }}>
                Rank System
              </div>
              <div style={{ fontSize: 12, color: "#52525B", marginBottom: 20, fontFamily: MONO }}>
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
                        background: isActive ? `${r.color}10` : "#0F0F11",
                        border: isActive ? `1px solid ${r.color}44` : "1px solid #18181B",
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: 22, width: 32, textAlign: "center", color: r.color }}>
                        {r.icon}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: isActive ? r.color : "#52525B",
                            fontFamily: MONO,
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
                        <div style={{ fontSize: 11, color: "#3F3F46", marginTop: 2, fontFamily: MONO }}>
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
            borderTop: "1px solid #18181B",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "#3F3F46",
            fontFamily: MONO,
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

      {/* Create Club Modal */}
      <Modal open={createClubOpen} onClose={() => setCreateClubOpen(false)} title="Create Club">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Club Name
            </div>
            <input style={inputStyle} placeholder="Midnight Burners" />
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Tag (3 chars)
            </div>
            <input style={inputStyle} placeholder="MDN" maxLength={4} />
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Tagline
            </div>
            <input style={inputStyle} placeholder="3am > 3pm" />
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Minimum Rank
            </div>
            <select style={inputStyle as React.CSSProperties}>
              {RANKS.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#E4E4E7",
              fontFamily: MONO,
            }}
          >
            <input type="checkbox" /> Private · invite only
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={ghostBtn} onClick={() => setCreateClubOpen(false)}>
              Cancel
            </button>
            <button style={primaryBtn} onClick={() => setCreateClubOpen(false)}>
              Create
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Challenge Modal */}
      <Modal
        open={createChallengeOpen}
        onClose={() => setCreateChallengeOpen(false)}
        title="Create Challenge"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Challenge Name
            </div>
            <input
              style={inputStyle}
              defaultValue={challengePrefill}
              placeholder="Weekly Burn Sprint"
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Tagline
            </div>
            <input style={inputStyle} placeholder="most tokens in 7 days wins" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "#52525B",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 6,
                  fontFamily: MONO,
                }}
              >
                Target Tokens
              </div>
              <input style={inputStyle} placeholder="100000000" />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "#52525B",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 6,
                  fontFamily: MONO,
                }}
              >
                Ends At
              </div>
              <input style={inputStyle} placeholder="2026-04-30" />
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: "#52525B",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: MONO,
              }}
            >
              Prize
            </div>
            <input style={inputStyle} placeholder="Custom rank flair + bragging rights" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={ghostBtn} onClick={() => setCreateChallengeOpen(false)}>
              Cancel
            </button>
            <button style={primaryBtn} onClick={() => setCreateChallengeOpen(false)}>
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

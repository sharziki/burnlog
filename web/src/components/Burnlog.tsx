"use client";

import { useEffect, useRef, useState } from "react";
import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

type ClubData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  memberCount: number;
  totalTokens: number;
  isMember: boolean;
  isOwner: boolean;
  owner: { username: string | null; name: string | null; image: string | null };
  topMembers: {
    id: string;
    username: string | null;
    name: string | null;
    image: string | null;
    totalTokens: number;
  }[];
};

type ClubDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  memberCount: number;
  totalTokens: number;
  weeklyTokens: number;
  isMember: boolean;
  isOwner: boolean;
  owner: { id: string; username: string | null; name: string | null; image: string | null };
  members: {
    id: string;
    username: string | null;
    name: string | null;
    image: string | null;
    bio: string | null;
    totalTokens: number;
    weeklyTokens: number;
    joinedAt: string;
  }[];
};

type ClubAnnouncement = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string | null; name: string | null; image: string | null };
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';
const DOLLARS_PER_TOKEN = 0.00001;

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

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "openclaw",
  "anthropic-api": "Anthropic API",
  "openai-api": "OpenAI API",
};

// Avatar helper — shows GitHub image or initials fallback
function UserAvatar({ user, size = 36, color }: { user: UserStats; size?: number; color: string }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.username}
        width={size}
        height={size}
        style={{
          borderRadius: "50%",
          border: `2px solid ${color}44`,
          objectFit: "cover",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `${color}22`,
        border: `2px solid ${color}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        color,
        fontFamily: MONO,
      }}
    >
      {user.avatar}
    </div>
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

// ---------- Button helpers ----------
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
        {value.image ? (
          <img
            src={value.image}
            alt={value.username}
            width={40}
            height={40}
            style={{ borderRadius: 8, objectFit: "cover", border: `1px solid ${rank.color}44` }}
          />
        ) : (
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
        )}
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
                {u.image ? (
                  <img src={u.image} alt="" width={24} height={24} style={{ borderRadius: "50%", flexShrink: 0 }} />
                ) : (
                  <span style={{ color: r.color, fontSize: 14, width: 24, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>
                )}
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
  signOutAction,
  signInAction,
}: {
  users: UserStats[];
  currentUsername: string | null;
  signOutAction?: () => Promise<void>;
  signInAction?: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"leaderboard" | "clubs" | "h2h" | "profile" | "badges">("leaderboard");
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(
    (currentUsername && users.find((u) => u.username === currentUsername)) || users[0] || null,
  );
  const [viewingUser, setViewingUser] = useState<UserStats | null>(null);
  const [timeframe, setTimeframe] = useState<"all-time" | "weekly">("all-time");
  const [mounted, setMounted] = useState(false);

  // Editable socials state
  const [editBio, setEditBio] = useState(selectedUser?.bio ?? "");
  const [editGithub, setEditGithub] = useState(selectedUser?.github ?? "");
  const [editTwitter, setEditTwitter] = useState(selectedUser?.twitter ?? "");
  const [editWebsite, setEditWebsite] = useState(selectedUser?.website ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // H2H state
  const [h2hLeft, setH2hLeft] = useState<UserStats | null>(users[0] ?? null);
  const [h2hRight, setH2hRight] = useState<UserStats | null>(users[1] ?? null);
  const [h2hLeftOpen, setH2hLeftOpen] = useState(false);
  const [h2hRightOpen, setH2hRightOpen] = useState(false);

  // Clubs state
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubDesc, setNewClubDesc] = useState("");
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubCreating, setClubCreating] = useState(false);
  const [clubImage, setClubImage] = useState<string | null>(null);
  const clubFileRef = useRef<HTMLInputElement>(null);

  // Club detail state
  const [activeClub, setActiveClub] = useState<ClubDetail | null>(null);
  const [clubAnnouncements, setClubAnnouncements] = useState<ClubAnnouncement[]>([]);
  const [clubDetailLoading, setClubDetailLoading] = useState(false);
  const [clubSubTab, setClubSubTab] = useState<"leaderboard" | "members" | "feed">("leaderboard");
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // API key state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  async function createKey() {
    setKeyLoading(true);
    try {
      const res = await fetch("/api/me/key", { method: "POST" });
      const data = (await res.json()) as { key?: string };
      if (data.key) setApiKey(data.key);
    } finally {
      setKeyLoading(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: editBio, github: editGithub, twitter: editTwitter, website: editWebsite }),
      });
      if (res.ok) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
        if (selectedUser) {
          selectedUser.bio = editBio || null;
          selectedUser.github = editGithub || null;
          selectedUser.twitter = editTwitter || null;
          selectedUser.website = editWebsite || null;
        }
      }
    } finally {
      setSavingProfile(false);
    }
  }

  function handleClubImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setClubImage(canvas.toDataURL("image/webp", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Clubs fetch + actions
  async function fetchClubs() {
    setClubsLoading(true);
    try {
      const res = await fetch("/api/clubs");
      if (res.ok) {
        const data = await res.json();
        setClubs(data.clubs ?? []);
      }
    } finally {
      setClubsLoading(false);
    }
  }

  async function handleCreateClub() {
    setClubError(null);
    if (!newClubName.trim()) {
      setClubError("Name is required");
      return;
    }
    setClubCreating(true);
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClubName.trim(),
          description: newClubDesc.trim() || undefined,
          image: clubImage ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClubError(data.message ?? "Failed to create club");
        return;
      }
      setShowCreateClub(false);
      setNewClubName("");
      setNewClubDesc("");
      setClubImage(null);
      fetchClubs();
    } finally {
      setClubCreating(false);
    }
  }

  async function handleJoinLeave(clubId: string, isMember: boolean) {
    const action = isMember ? "leave" : "join";
    const res = await fetch(`/api/clubs/${clubId}/${action}`, { method: "POST" });
    if (res.ok) {
      fetchClubs();
      if (activeClub?.id === clubId) openClub(clubId);
    }
  }

  async function openClub(clubId: string) {
    setClubDetailLoading(true);
    setClubSubTab("leaderboard");
    try {
      const [detailRes, annRes] = await Promise.all([
        fetch(`/api/clubs/${clubId}`),
        fetch(`/api/clubs/${clubId}/announcements`),
      ]);
      if (detailRes.ok) {
        const d = await detailRes.json();
        setActiveClub(d.club);
      }
      if (annRes.ok) {
        const a = await annRes.json();
        setClubAnnouncements(a.announcements ?? []);
        setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight }), 100);
      }
    } finally {
      setClubDetailLoading(false);
    }
  }

  async function postAnnouncement() {
    if (!activeClub || !newAnnouncement.trim()) return;
    setPostingAnnouncement(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newAnnouncement.trim() }),
      });
      if (res.ok) {
        setNewAnnouncement("");
        const annRes = await fetch(`/api/clubs/${activeClub.id}/announcements`);
        if (annRes.ok) {
          const a = await annRes.json();
          setClubAnnouncements(a.announcements ?? []);
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }), 50);
        }
      }
    } finally {
      setPostingAnnouncement(false);
    }
  }

  async function deleteMessage(msgId: string) {
    if (!activeClub) return;
    const res = await fetch(`/api/clubs/${activeClub.id}/announcements/${msgId}`, { method: "DELETE" });
    if (res.ok) {
      setClubAnnouncements((prev) => prev.filter((a) => a.id !== msgId));
    }
  }

  async function kickMember(targetId: string) {
    if (!activeClub) return;
    const res = await fetch(`/api/clubs/${activeClub.id}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId }),
    });
    if (res.ok) {
      openClub(activeClub.id);
    }
  }

  // Onboarding CTA banner
  const [ctaDismissed, setCtaDismissed] = useState(true); // default true to avoid flash
  useEffect(() => {
    setCtaDismissed(localStorage.getItem("burnlog:cta-dismissed") === "1");
  }, []);
  const showOnboardingCta = currentUsername && selectedUser && selectedUser.totalTokens === 0 && !ctaDismissed;
  function dismissCta() {
    localStorage.setItem("burnlog:cta-dismissed", "1");
    setCtaDismissed(true);
  }

  // Auto-refresh leaderboard data
  const [liveUsers, setLiveUsers] = useState(users);
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) {
          const data = await res.json();
          if (data.users && Array.isArray(data.users)) setLiveUsers(data.users);
        }
      } catch {}
    }, 60_000);
    return () => clearInterval(interval);
  }, []);
  // Use liveUsers for rendering but keep original users as fallback
  const activeUsers = liveUsers;

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "clubs") fetchClubs(); }, [tab]);

  useEffect(() => {
    if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; }
    if (!activeClub || clubSubTab !== "feed") return;
    const poll = async () => {
      const last = clubAnnouncements[clubAnnouncements.length - 1];
      const since = last ? `?since=${encodeURIComponent(last.createdAt)}` : "";
      try {
        const res = await fetch(`/api/clubs/${activeClub.id}/announcements${since}`);
        if (res.ok) {
          const data = await res.json();
          const newMsgs = (data.announcements ?? []) as ClubAnnouncement[];
          if (newMsgs.length > 0) {
            setClubAnnouncements((prev) => {
              const ids = new Set(prev.map((m) => m.id));
              const fresh = newMsgs.filter((m) => !ids.has(m.id));
              if (fresh.length === 0) return prev;
              const merged = [...prev, ...fresh];
              setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }), 50);
              return merged;
            });
          }
        }
      } catch {}
    };
    chatPollRef.current = setInterval(poll, 3000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, clubSubTab, clubAnnouncements.length]);

  const rank = selectedUser ? getRank(selectedUser.totalTokens) : RANKS[0];

  const sortedUsers = [...activeUsers].sort((a, b) => {
    if (timeframe === "weekly") return b.weeklyTokens - a.weeklyTokens;
    return b.totalTokens - a.totalTokens;
  });

  const globalStats = {
    totalBurned: activeUsers.reduce((s, u) => s + u.totalTokens, 0),
    activeUsers: activeUsers.length,
    avgPerUser: activeUsers.length
      ? Math.round(activeUsers.reduce((s, u) => s + u.totalTokens, 0) / activeUsers.length)
      : 0,
    weeklyTotal: activeUsers.reduce((s, u) => s + u.weeklyTokens, 0),
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
        <div style={{ ...styles.container, padding: "80px 24px", textAlign: "center" as const }}>
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
              textDecoration: "none",
            }}
          >
            Get started →
          </a>
        </div>
      </div>
    );
  }

  const topModelMax = Math.max(...selectedUser.topModels.map((m) => m.tokens), 1);

  // H2H metrics
  const h2hMetrics = h2hLeft && h2hRight ? buildMetrics(h2hLeft, h2hRight) : [];
  const h2hWins = countWins(h2hMetrics);

  return (
    <div style={styles.app}>
      <div style={styles.noise} />
      <div style={styles.glow} />

      <div style={styles.container}>
        {/* Hero landing section for unauthenticated visitors */}
        {!currentUsername && (
          <div style={{ paddingTop: 48, paddingBottom: 40, borderBottom: "1px solid #18181B" }}>
            <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#FAFAFA", letterSpacing: -1.5, lineHeight: 1.1, fontFamily: SANS, marginBottom: 16 }}>
                Track the burn.
              </div>
              <div style={{ fontSize: 16, color: "#71717A", lineHeight: 1.6, marginBottom: 32, fontFamily: SANS }}>
                The competitive leaderboard for AI token usage. See how hard you ship with AI.
              </div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                {signInAction && (
                  <form action={signInAction}>
                    <button
                      type="submit"
                      style={{
                        padding: "14px 28px",
                        background: "#D97706",
                        color: "#09090B",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: MONO,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#09090B">
                        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                      </svg>
                      Sign in with GitHub
                    </button>
                  </form>
                )}
                <a
                  href="#leaderboard"
                  style={{
                    fontSize: 13,
                    color: "#71717A",
                    fontFamily: MONO,
                    textDecoration: "none",
                    padding: "14px 20px",
                    border: "1px solid #27272A",
                    borderRadius: 8,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#52525B"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#27272A"; }}
                >
                  View Leaderboard
                </a>
              </div>
            </div>

            {/* How it works */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                marginTop: 48,
              }}
            >
              {[
                {
                  step: "01",
                  title: "Install",
                  code: "npm i -g @sxnalabs/burnlog",
                  desc: "One command. Works with Claude Code, Codex, and more.",
                },
                {
                  step: "02",
                  title: "Sync",
                  code: "burnlog auth && burnlog sync",
                  desc: "Reads your local agent logs. Your prompts never leave your machine.",
                },
                {
                  step: "03",
                  title: "Compete",
                  code: null,
                  desc: "Climb the ranks. Challenge friends. Show off your badge on GitHub.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  style={{
                    background: "#0C0C0E",
                    border: "1px solid #18181B",
                    borderRadius: 12,
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 10, color: "#D97706", fontFamily: MONO, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>
                    {item.step}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA", marginBottom: 8, fontFamily: SANS }}>
                    {item.title}
                  </div>
                  {item.code && (
                    <div
                      style={{
                        padding: "8px 12px",
                        background: "#0F0F11",
                        border: "1px solid #18181B",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#D97706",
                        fontFamily: MONO,
                        marginBottom: 10,
                        overflowX: "auto",
                      }}
                    >
                      <span style={{ color: "#3F3F46" }}>$ </span>{item.code}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#71717A", lineHeight: 1.5 }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* Social proof */}
            {globalStats.totalBurned > 0 && (
              <div style={{ textAlign: "center", marginTop: 32, fontSize: 13, color: "#3F3F46", fontFamily: MONO }}>
                <span style={{ color: "#D97706", fontWeight: 700 }}>{globalStats.activeUsers}</span> developer{globalStats.activeUsers === 1 ? "" : "s"} tracking{" "}
                <span style={{ color: "#D97706", fontWeight: 700 }}>{formatTokens(globalStats.totalBurned)}</span> tokens burned
              </div>
            )}

            {/* Privacy callout */}
            <div
              style={{
                marginTop: 24,
                padding: "16px 20px",
                background: "#0C0C0E",
                border: "1px solid #18181B",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12,
                color: "#71717A",
                fontFamily: MONO,
              }}
            >
              <span style={{ fontSize: 16, color: "#52525B" }}>&#9670;</span>
              <span>
                Your prompts stay local. We only track token counts.{" "}
                <a href="https://github.com/sharziki/burnlog" target="_blank" rel="noopener noreferrer" style={{ color: "#D97706", textDecoration: "none" }}>
                  Open source CLI
                </a>
                {" "}&mdash; audit it yourself.
              </span>
              <a href="/privacy" style={{ color: "#52525B", marginLeft: "auto", textDecoration: "none", whiteSpace: "nowrap" }}>
                Privacy &rarr;
              </a>
            </div>
          </div>
        )}

        {/* Tab nav */}
        <div style={{ paddingTop: 20 }} id="leaderboard">
          <nav style={styles.nav}>
            {(
              [
                ["leaderboard", "Board"],
                ["clubs", "Clubs"],
                ["h2h", "H2H"],
                ["badges", "Embed"],
                ...(currentUsername ? [["profile", "Profile"] as const] : []),
              ] as const
            ).map(([key, label]) => (
              <button key={key} style={styles.navBtn(tab === key)} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </div>

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

            {/* Onboarding CTA */}
            {showOnboardingCta && (
              <div
                style={{
                  background: "#0C0C0E",
                  border: "1px solid #18181B",
                  borderRadius: 12,
                  padding: "20px 24px",
                  marginBottom: 16,
                  position: "relative",
                }}
              >
                <button
                  onClick={dismissCta}
                  style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}
                >
                  &times;
                </button>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#FAFAFA", marginBottom: 4 }}>
                  You&apos;re on the board &mdash; now light it up.
                </div>
                <div style={{ fontSize: 12, color: "#71717A", marginBottom: 12 }}>
                  Install the CLI to start tracking your token burn.
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    onClick={() => copyToClip("onboard", "npm i -g @sxnalabs/burnlog && burnlog auth && burnlog sync")}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: "#0F0F11",
                      border: "1px solid #18181B",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#D97706",
                      fontFamily: MONO,
                      cursor: "pointer",
                      overflowX: "auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "#3F3F46" }}>$ </span>npm i -g @sxnalabs/burnlog &amp;&amp; burnlog auth &amp;&amp; burnlog sync
                  </div>
                  <button
                    onClick={() => copyToClip("onboard", "npm i -g @sxnalabs/burnlog && burnlog auth && burnlog sync")}
                    style={{
                      ...primaryBtn,
                      padding: "10px 16px",
                      fontSize: 11,
                      borderRadius: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copied === "onboard" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {sortedUsers.map((user, i) => {
              const r = getRank(user.totalTokens);
              const tokens = timeframe === "weekly" ? user.weeklyTokens : user.totalTokens;
              const isEmpty = user.totalTokens === 0;
              return (
                <div
                  key={user.id}
                  style={styles.leaderboardRow(selectedUser.id === user.id, i)}
                  onClick={() => setViewingUser(user)}
                >
                  <span style={styles.rankNum(i)}>{i + 1}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <UserAvatar user={user} size={36} color={r.color} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{user.name}</div>
                      <a
                        href={`/u/${user.username}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 11, color: "#52525B", fontFamily: MONO, textDecoration: "none" }}
                      >
                        @{user.username}
                      </a>
                      <div style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginTop: 1, display: "flex", gap: 8 }}>
                        <span>active {relativeTime(user.lastActive)}</span>
                        {user.streak > 0 && (
                          <span style={{ color: user.streak >= 7 ? "#D97706" : "#52525B" }}>
                            {user.streak >= 7 ? "\u{1F525}" : "\u25CF"} {user.streak}d streak
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Sparkline data={user.weeklyHistory} color={r.color} width={110} height={28} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isEmpty ? "#3F3F46" : "#FAFAFA", fontFamily: MONO }}>
                    {isEmpty ? (
                      <span style={{ fontSize: 11, fontWeight: 500, fontStyle: "italic", color: "#3F3F46" }}>awaiting first burn...</span>
                    ) : (
                      formatTokens(tokens)
                    )}
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
            {!activeClub && (
              <div style={styles.sectionHeader}>
                <div style={styles.sectionTitle}>Clubs</div>
                {currentUsername && (
                  <button style={primaryBtn} onClick={() => { setShowCreateClub(true); setClubError(null); }}>
                    Create Club
                  </button>
                )}
              </div>
            )}

            {/* Create club modal */}
            {showCreateClub && (
              <div
                onClick={() => { setShowCreateClub(false); setClubError(null); }}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.75)",
                  backdropFilter: "blur(6px)",
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
                    borderRadius: 16,
                    padding: 32,
                    width: "100%",
                    maxWidth: 480,
                    fontFamily: SANS,
                    color: "#E4E4E7",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                  }}
                >
                  {/* Modal header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#FAFAFA" }}>Create Club</div>
                    <button
                      onClick={() => { setShowCreateClub(false); setClubError(null); }}
                      style={{ background: "transparent", border: "none", color: "#52525B", cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Image upload */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
                    <button
                      type="button"
                      onClick={() => clubFileRef.current?.click()}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 16,
                        border: clubImage ? "none" : "2px dashed #27272A",
                        background: clubImage ? "transparent" : "#0F0F11",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        overflow: "hidden",
                        padding: 0,
                        position: "relative",
                      }}
                    >
                      {clubImage ? (
                        <>
                          <img src={clubImage} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 16 }} />
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(0,0,0,0.5)",
                              borderRadius: 16,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: 0,
                              transition: "opacity 0.15s",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                          >
                            <span style={{ color: "#FAFAFA", fontSize: 10, fontFamily: MONO, letterSpacing: 1 }}>CHANGE</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="4" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                          </svg>
                          <span style={{ fontSize: 9, color: "#3F3F46", fontFamily: MONO, letterSpacing: 0.5 }}>UPLOAD</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={clubFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleClubImage}
                      style={{ display: "none" }}
                    />
                  </div>

                  {/* Name */}
                  <label style={{ fontSize: 10, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: MONO, display: "block", marginBottom: 6 }}>
                    Club Name
                  </label>
                  <input
                    value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    placeholder="e.g. Anthropic Addicts"
                    maxLength={50}
                    autoFocus
                    style={{
                      width: "100%",
                      background: "#0F0F11",
                      border: "1px solid #18181B",
                      borderRadius: 8,
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#E4E4E7",
                      fontFamily: MONO,
                      outline: "none",
                      marginBottom: 16,
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#D97706"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#18181B"; }}
                  />

                  {/* Description */}
                  <label style={{ fontSize: 10, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: MONO, display: "block", marginBottom: 6 }}>
                    Description
                  </label>
                  <textarea
                    value={newClubDesc}
                    onChange={(e) => setNewClubDesc(e.target.value)}
                    placeholder="What's this club about? (optional)"
                    rows={3}
                    style={{
                      width: "100%",
                      background: "#0F0F11",
                      border: "1px solid #18181B",
                      borderRadius: 8,
                      padding: "12px 14px",
                      fontSize: 13,
                      color: "#E4E4E7",
                      fontFamily: MONO,
                      outline: "none",
                      resize: "vertical",
                      marginBottom: 20,
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#D97706"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#18181B"; }}
                  />

                  {/* Error */}
                  {clubError && (
                    <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 14, fontFamily: MONO, padding: "8px 12px", background: "#EF444410", borderRadius: 6, border: "1px solid #EF444433" }}>
                      {clubError}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setShowCreateClub(false); setNewClubName(""); setNewClubDesc(""); setClubImage(null); setClubError(null); }}
                      style={{
                        padding: "10px 20px",
                        background: "transparent",
                        color: "#52525B",
                        border: "1px solid #18181B",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: MONO,
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateClub}
                      disabled={clubCreating}
                      style={{
                        ...primaryBtn,
                        padding: "10px 24px",
                        borderRadius: 8,
                        opacity: clubCreating ? 0.6 : 1,
                        cursor: clubCreating ? "wait" : "pointer",
                      }}
                    >
                      {clubCreating ? "Creating..." : "Create Club"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading */}
            {!activeClub && clubsLoading && clubs.length === 0 && (
              <div style={{ ...styles.card, textAlign: "center", padding: 48, color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
                Loading clubs...
              </div>
            )}

            {/* Empty */}
            {!activeClub && !clubsLoading && clubs.length === 0 && (
              <div style={{ ...styles.card, textAlign: "center", padding: 48, color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
                No clubs yet. Create the first one.
              </div>
            )}

            {/* Club cards */}
            {!activeClub && clubs.map((club) => (
              <div
                key={club.id}
                style={{ ...styles.card, marginBottom: 12, cursor: "pointer", transition: "border-color 0.15s" }}
                onClick={() => openClub(club.id)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#27272A"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#18181B"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    {club.image ? (
                      <img src={club.image} alt={club.name} width={44} height={44} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #18181B" }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, #D9770622 0%, #D9770608 100%)", border: "1px solid #D9770633", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#D97706", fontFamily: MONO }}>
                        {club.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>{club.name}</div>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>/{club.slug}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {club.isOwner && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "#D9770615", padding: "4px 10px", borderRadius: 4, border: "1px solid #D9770633", fontFamily: MONO, letterSpacing: 0.5 }}>OWNER</span>
                    )}
                    <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>{club.memberCount} members · {formatTokens(club.totalTokens)}</span>
                    <span style={{ color: "#3F3F46", fontSize: 12 }}>→</span>
                  </div>
                </div>
                {club.description && (
                  <div style={{ fontSize: 12, color: "#71717A", marginTop: 8 }}>{club.description}</div>
                )}
              </div>
            ))}

            {/* Club detail view */}
            {activeClub && (
              <div>
                {/* Back + header */}
                <button
                  onClick={() => setActiveClub(null)}
                  style={{ background: "none", border: "none", color: "#52525B", cursor: "pointer", fontFamily: MONO, fontSize: 11, padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}
                >
                  ← All Clubs
                </button>

                <div style={{ ...styles.card, marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
                    {activeClub.image ? (
                      <img src={activeClub.image} alt={activeClub.name} width={56} height={56} style={{ borderRadius: 12, objectFit: "cover", border: "1px solid #18181B" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg, #D9770622 0%, #D9770608 100%)", border: "1px solid #D9770633", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#D97706", fontFamily: MONO }}>
                        {activeClub.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#FAFAFA" }}>{activeClub.name}</div>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>/{activeClub.slug} · {activeClub.memberCount} members · owned by @{activeClub.owner.username}</div>
                    </div>
                    {currentUsername && !activeClub.isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleJoinLeave(activeClub.id, activeClub.isMember); }}
                        style={activeClub.isMember
                          ? { padding: "8px 16px", background: "transparent", color: "#52525B", border: "1px solid #18181B", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: MONO, cursor: "pointer" }
                          : { ...primaryBtn, padding: "8px 16px", fontSize: 11 }
                        }
                      >
                        {activeClub.isMember ? "Leave" : "Join"}
                      </button>
                    )}
                  </div>
                  {activeClub.description && (
                    <div style={{ fontSize: 13, color: "#A1A1AA", marginBottom: 16 }}>{activeClub.description}</div>
                  )}
                  <div style={{ display: "flex", gap: 20, fontSize: 11, fontFamily: MONO }}>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>Total </span><span style={{ color: "#D97706", fontWeight: 700 }}>{formatTokens(activeClub.totalTokens)}</span></div>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>This Week </span><span style={{ color: "#FAFAFA", fontWeight: 700 }}>{formatTokens(activeClub.weeklyTokens)}</span></div>
                  </div>
                </div>

                {/* Sub-nav */}
                <nav style={{ ...styles.nav, marginBottom: 16 }}>
                  {(["leaderboard", "members", "feed"] as const).map((t) => (
                    <button key={t} style={styles.navBtn(clubSubTab === t)} onClick={() => setClubSubTab(t)}>
                      {t === "leaderboard" ? "Leaderboard" : t === "members" ? "Members" : "Feed"}
                    </button>
                  ))}
                </nav>

                {/* Club Leaderboard */}
                {clubSubTab === "leaderboard" && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 120px 100px", padding: "0 16px 8px", fontSize: 10, color: "#3F3F46", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>
                      <span>#</span><span>Member</span><span>Weekly</span><span>Total</span>
                    </div>
                    {activeClub.members.map((m, i) => {
                      const r = getRank(m.totalTokens);
                      return (
                        <div key={m.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 120px 100px", alignItems: "center", padding: "12px 16px", borderRadius: 10, background: i % 2 === 0 ? "#0C0C0E" : "transparent", border: "1px solid transparent", marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: i === 0 ? "#D97706" : i === 1 ? "#E4E4E7" : i === 2 ? "#92400E" : "#3F3F46", fontFamily: MONO }}>{i + 1}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {m.image ? (
                              <img src={m.image} alt={m.username ?? ""} width={32} height={32} style={{ borderRadius: "50%", border: `2px solid ${r.color}44` }} />
                            ) : (
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${r.color}22`, border: `2px solid ${r.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: r.color, fontFamily: MONO }}>
                                {(m.name ?? m.username ?? "?")[0]?.toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{m.name}</div>
                              <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>@{m.username}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: "#A1A1AA", fontFamily: MONO }}>{formatTokens(m.weeklyTokens)}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#FAFAFA", fontFamily: MONO }}>{formatTokens(m.totalTokens)}</div>
                        </div>
                      );
                    })}
                    {activeClub.members.length === 0 && (
                      <div style={{ ...styles.card, textAlign: "center", padding: 32, color: "#52525B", fontFamily: MONO, fontSize: 12 }}>No members yet.</div>
                    )}
                  </div>
                )}

                {/* Members grid */}
                {clubSubTab === "members" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                    {activeClub.members.map((m) => {
                      const r = getRank(m.totalTokens);
                      const isSelf = m.username === currentUsername;
                      const isClubOwner = m.id === activeClub.owner.id;
                      return (
                        <div key={m.id} style={{ ...styles.card, display: "flex", gap: 12, alignItems: "center" }}>
                          {m.image ? (
                            <img src={m.image} alt={m.username ?? ""} width={40} height={40} style={{ borderRadius: "50%", border: `2px solid ${r.color}44` }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${r.color}22`, border: `2px solid ${r.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: r.color, fontFamily: MONO }}>
                              {(m.name ?? m.username ?? "?")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                              {isClubOwner && <span style={{ fontSize: 8, color: "#D97706", background: "#D9770615", padding: "1px 5px", borderRadius: 3, fontFamily: MONO, fontWeight: 700, letterSpacing: 0.5 }}>ADMIN</span>}
                            </div>
                            <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>@{m.username}</div>
                            <div style={{ fontSize: 10, color: r.color, fontFamily: MONO, marginTop: 2 }}>{r.icon} {r.name} · {formatTokens(m.totalTokens)}</div>
                          </div>
                          {activeClub.isOwner && !isSelf && !isClubOwner && (
                            <button
                              onClick={() => kickMember(m.id)}
                              title="Kick member"
                              style={{ background: "none", border: "1px solid #27272A", borderRadius: 6, color: "#52525B", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontFamily: MONO, transition: "all 0.15s" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#EF444466"; (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#27272A"; (e.currentTarget as HTMLElement).style.color = "#52525B"; }}
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Chat Room */}
                {clubSubTab === "feed" && (() => {
                  const myId = activeClub.members.find((m) => m.username === currentUsername)?.id;
                  const isAdmin = activeClub.isOwner;
                  return (
                    <div style={{ ...styles.card, padding: 0, display: "flex", flexDirection: "column", height: 520, overflow: "hidden" }}>
                      {/* Messages */}
                      <div
                        ref={chatScrollRef}
                        style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 2 }}
                      >
                        {clubAnnouncements.length === 0 && (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3F3F46", fontFamily: MONO, fontSize: 12 }}>
                            {activeClub.isMember ? "No messages yet. Say something." : "No messages yet. Join to chat."}
                          </div>
                        )}
                        {clubAnnouncements.map((a, i) => {
                          const isMe = myId === a.author.id;
                          const canDelete = isAdmin || isMe;
                          const prevAuthor = i > 0 ? clubAnnouncements[i - 1].author.id : null;
                          const grouped = prevAuthor === a.author.id;
                          return (
                            <div
                              key={a.id}
                              style={{ display: "flex", gap: 10, padding: grouped ? "1px 0" : "8px 0 1px", alignItems: "flex-start", position: "relative" }}
                              className="chat-msg"
                            >
                              <div style={{ width: 28, flexShrink: 0 }}>
                                {!grouped && (
                                  a.author.image ? (
                                    <img src={a.author.image} alt={a.author.username ?? ""} width={28} height={28} style={{ borderRadius: "50%", border: "1px solid #27272A" }} />
                                  ) : (
                                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#18181B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#52525B", fontFamily: MONO }}>
                                      {(a.author.name ?? a.author.username ?? "?")[0]?.toUpperCase()}
                                    </div>
                                  )
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {!grouped && (
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: isMe ? "#D97706" : "#E4E4E7", fontFamily: MONO }}>
                                      {a.author.username}
                                      {a.author.id === activeClub.owner.id && (
                                        <span style={{ fontSize: 9, color: "#D97706", background: "#D9770615", padding: "1px 5px", borderRadius: 3, marginLeft: 6, fontWeight: 600, letterSpacing: 0.5 }}>ADMIN</span>
                                      )}
                                    </span>
                                    <span style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO }}>
                                      {new Date(a.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                    </span>
                                  </div>
                                )}
                                <div style={{ fontSize: 13, color: "#D4D4D8", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.content}</div>
                              </div>
                              {canDelete && (
                                <button
                                  onClick={() => deleteMessage(a.id)}
                                  title="Delete message"
                                  style={{ background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 13, padding: "2px 4px", opacity: 0.4, transition: "opacity 0.15s", flexShrink: 0, alignSelf: "center" }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; (e.currentTarget as HTMLElement).style.color = "#3F3F46"; }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Input bar */}
                      {activeClub.isMember ? (
                        <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #18181B", display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            value={newAnnouncement}
                            onChange={(e) => setNewAnnouncement(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && newAnnouncement.trim()) { e.preventDefault(); postAnnouncement(); } }}
                            placeholder="Type a message..."
                            maxLength={500}
                            style={{ flex: 1, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#E4E4E7", fontFamily: MONO, outline: "none", transition: "border-color 0.15s" }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "#D97706"; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = "#18181B"; }}
                          />
                          <button
                            onClick={postAnnouncement}
                            disabled={postingAnnouncement || !newAnnouncement.trim()}
                            style={{ ...primaryBtn, padding: "10px 18px", fontSize: 11, borderRadius: 8, opacity: postingAnnouncement || !newAnnouncement.trim() ? 0.4 : 1, cursor: postingAnnouncement ? "wait" : "pointer" }}
                          >
                            Send
                          </button>
                        </div>
                      ) : (
                        <div style={{ padding: "14px 16px", borderTop: "1px solid #18181B", textAlign: "center", fontSize: 12, color: "#3F3F46", fontFamily: MONO }}>
                          Join this club to chat
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* H2H TAB */}
        {tab === "h2h" && (
          <div style={styles.section}>
            {users.length < 2 || !h2hLeft || !h2hRight ? (
              <div style={{ ...styles.card, textAlign: "center", padding: 48, color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
                Head-to-head requires at least two users on the board.
              </div>
            ) : (<>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Head-to-Head</div>
              <button
                style={primaryBtn}
                onClick={() => {
                  // challenges coming soon

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
                options={users}
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
                options={users}
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
            </>)}
          </div>
        )}

        {/* PROFILE TAB */}
        {tab === "profile" && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>Profile · <a href={`/u/${selectedUser.username}`} style={{ color: "inherit", textDecoration: "none" }}>@{selectedUser.username}</a></div>
              <div style={{ display: "flex", gap: 4 }}>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{
                      cursor: "pointer",
                      background: "none",
                      border: selectedUser.id === u.id
                        ? `2px solid ${getRank(u.totalTokens).color}`
                        : `1px solid transparent`,
                      borderRadius: "50%",
                      padding: 0,
                    }}
                  >
                    <UserAvatar user={u} size={32} color={getRank(u.totalTokens).color} />
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.profileCard}>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24 }}>
                <UserAvatar user={selectedUser} size={64} color={rank.color} />
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

            {/* Account section — only when viewing own profile */}
            {currentUsername && selectedUser.username === currentUsername && (
              <div
                style={{
                  ...styles.profileCard,
                  marginTop: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#52525B",
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    marginBottom: 16,
                    fontFamily: MONO,
                  }}
                >
                  Account
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 12 }}>
                    Setup — track your token burn
                  </div>

                  {/* Step 1 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, fontWeight: 700, marginBottom: 6 }}>1. Generate an API key</div>
                    <button
                      onClick={createKey}
                      disabled={keyLoading}
                      style={{ ...primaryBtn, cursor: keyLoading ? "wait" : "pointer", opacity: keyLoading ? 0.6 : 1 }}
                    >
                      {keyLoading ? "generating..." : "generate new key"}
                    </button>
                    {apiKey && (
                      <div style={{ marginTop: 12 }}>
                        <div
                          onClick={() => copyToClip("apikey", apiKey)}
                          style={{ padding: "14px 16px", background: "#0F0F11", border: "1px solid #D9770644", borderRadius: 8, fontSize: 12, color: "#D97706", wordBreak: "break-all", fontFamily: MONO, cursor: "pointer", position: "relative" }}
                        >
                          <div style={{ fontSize: 10, color: "#52525B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                            {copied === "apikey" ? "copied!" : "click to copy — won’t be shown again"}
                          </div>
                          {apiKey}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, fontWeight: 700, marginBottom: 6 }}>2. Install the CLI</div>
                    <div
                      onClick={() => copyToClip("install", "npm i -g @sxnalabs/burnlog")}
                      style={{ padding: "10px 14px", background: "#0F0F11", border: "1px solid #18181B", borderRadius: 8, fontSize: 12, color: "#E4E4E7", fontFamily: MONO, cursor: "pointer" }}
                    >
                      <span style={{ color: "#52525B" }}>$ </span>npm i -g @sxnalabs/burnlog
                      <span style={{ float: "right", color: "#3F3F46", fontSize: 10 }}>{copied === "install" ? "copied!" : "click to copy"}</span>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, fontWeight: 700, marginBottom: 6 }}>3. Login with your key</div>
                    <div
                      onClick={() => copyToClip("login", `burnlog login ${apiKey ?? "<your-key>"}`)}
                      style={{ padding: "10px 14px", background: "#0F0F11", border: "1px solid #18181B", borderRadius: 8, fontSize: 12, color: "#E4E4E7", fontFamily: MONO, cursor: "pointer" }}
                    >
                      <span style={{ color: "#52525B" }}>$ </span>burnlog login {apiKey ? <span style={{ color: "#D97706" }}>{apiKey}</span> : "<your-key>"}
                      <span style={{ float: "right", color: "#3F3F46", fontSize: 10 }}>{copied === "login" ? "copied!" : "click to copy"}</span>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, fontWeight: 700, marginBottom: 6 }}>4. Auto-sync with Claude Code</div>
                    <div style={{ fontSize: 12, color: "#52525B", fontFamily: MONO, lineHeight: 1.6, marginBottom: 8 }}>
                      This adds a hook to Claude Code that syncs your tokens after every session.
                    </div>
                    <div
                      onClick={() => copyToClip("hook", "burnlog install")}
                      style={{ padding: "10px 14px", background: "#0F0F11", border: "1px solid #18181B", borderRadius: 8, fontSize: 12, color: "#E4E4E7", fontFamily: MONO, cursor: "pointer" }}
                    >
                      <span style={{ color: "#52525B" }}>$ </span>burnlog install
                      <span style={{ float: "right", color: "#3F3F46", fontSize: 10 }}>{copied === "hook" ? "copied!" : "click to copy"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO, marginTop: 6, lineHeight: 1.5 }}>
                      Or run <code style={{ color: "#52525B" }}>burnlog sync</code> manually anytime. Use <code style={{ color: "#52525B" }}>burnlog daemon</code> for continuous background sync.
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO, padding: "10px 14px", background: "#0F0F1188", borderRadius: 8, lineHeight: 1.6 }}>
                    Supports Claude Code and Codex out of the box. Only token counts are sent — never prompts, code, or file paths.
                  </div>
                </div>

                {signOutAction && (
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      style={{
                        padding: "8px 14px",
                        background: "transparent",
                        color: "#52525B",
                        border: "1px solid #18181B",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: MONO,
                      }}
                    >
                      Sign out
                    </button>
                  </form>
                )}
              </div>
            )}
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
                {`[![burnlog](https://burnlog.net/badge/${selectedUser.username})](https://burnlog.net/u/${selectedUser.username})`}
              </div>

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#3F3F46", marginBottom: 6 }}>HTML</div>
                {`<a href="https://burnlog.net/u/${selectedUser.username}"><img src="https://burnlog.net/badge/${selectedUser.username}" alt="burnlog" /></a>`}
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

      </div>

      {/* Viewing user profile modal */}
      {viewingUser && (() => {
        const vRank = getRank(viewingUser.totalTokens);
        const vTopModelMax = Math.max(...viewingUser.topModels.map((m) => m.tokens), 1);
        return (
          <div
            onClick={() => setViewingUser(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#09090B",
                border: "1px solid #18181B",
                borderRadius: 16,
                padding: 32,
                maxWidth: 640,
                width: "100%",
                maxHeight: "85vh",
                overflowY: "auto",
                position: "relative",
              }}
            >
              <button
                onClick={() => setViewingUser(null)}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "none",
                  border: "none",
                  color: "#52525B",
                  fontSize: 20,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                &times;
              </button>

              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24 }}>
                <UserAvatar user={viewingUser} size={64} color={vRank.color} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#FAFAFA" }}>
                      {viewingUser.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: vRank.color,
                        background: `${vRank.color}15`,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${vRank.color}33`,
                        fontFamily: MONO,
                      }}
                    >
                      {vRank.icon} {vRank.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#52525B", marginBottom: 8, fontFamily: MONO }}>
                    @{viewingUser.username}
                  </div>
                  <div style={{ fontSize: 13, color: "#E4E4E7" }}>
                    {viewingUser.bio ?? "—"}
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
                  { label: "Total Burned", value: formatTokens(viewingUser.totalTokens) },
                  { label: "This Week", value: formatTokens(viewingUser.weeklyTokens) },
                  { label: "Streak", value: `${viewingUser.streak} days` },
                  { label: "Tok/Req", value: viewingUser.tokensPerCommit.toLocaleString() },
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

              {viewingUser.sources.length > 0 && (
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
                  <SourcesStrip sources={viewingUser.sources} />
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
                    {viewingUser.weeklyHistory.map((v, i) => {
                      const max = Math.max(...viewingUser.weeklyHistory, 1);
                      const h = (v / max) * 90;
                      return (
                        <div key={i} style={{ flex: 1, textAlign: "center" }}>
                          <div
                            style={{
                              height: h,
                              background:
                                i === 6
                                  ? `linear-gradient(180deg, ${vRank.color} 0%, ${vRank.color}44 100%)`
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
                  <ProviderBar providers={viewingUser.providers} />
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
                    {viewingUser.topModels.length === 0 ? (
                      <div style={{ fontSize: 11, color: "#3F3F46" }}>&mdash;</div>
                    ) : (
                      viewingUser.topModels.map((m) => (
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
                                  width: `${(m.tokens / vTopModelMax) * 100}%`,
                                  height: "100%",
                                  background: vRank.color,
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
                    Burn Activity &middot; 12 Weeks
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
                <ActivityHeatmap heatmap={viewingUser.heatmap} />
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

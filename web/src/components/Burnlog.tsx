"use client";

import { useEffect, useRef, useState } from "react";
import { Landing } from "./Landing";
import { compareUsers, outcomeOf, verdictOf } from "@/lib/h2h";
import { BoardScope, type Scope } from "./BoardScope";
import { ClubFeed } from "./ClubFeed";
import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { dollarsPerToken } from "@/lib/cost";
import type { UserStats } from "@/lib/stats";

type ClubData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  isPrivate: boolean;
  plan: "free" | "team" | "enterprise";
  limits: { memberLimit: number; teamKeyLimit: number };
  memberCount: number;
  totalTokens: number;
  monthlyTokens: number;
  monthlyBudgetTokens: number;
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
  isPrivate: boolean;
  plan: "free" | "team" | "enterprise";
  limits: { memberLimit: number; teamKeyLimit: number };
  inviteCode: string | null;
  budgetWebhookUrl: string | null;
  blockIngestOnBudget: boolean;
  memberCount: number;
  totalTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
  monthlyBudgetTokens: number;
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

type TeamKey = {
  id: string;
  label: string | null;
  monthlyTokens: number;
  monthlyBudgetTokens: number;
  createdAt: string;
  lastUsed: string | null;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';
const DOLLARS_PER_TOKEN = dollarsPerToken();

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




function estSpend(tokens: number): number {
  return tokens * DOLLARS_PER_TOKEN;
}

function formatUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function clubReportHref(clubId: string, from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return `/api/clubs/${clubId}/report${query ? `?${query}` : ""}`;
}

function budgetPct(used: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(999, Math.round((used / budget) * 100));
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

// ---------- Hero install line ----------
/**
 * The single command that gets someone on the board. Click-to-copy, because
 * the shortest path from "interested" to "installed" is one click, not a
 * hand-transcribed npx invocation.
 */
const INSTALL_COMMAND = "npx @sxnalabs/burnlog";

function InstallLine() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the text is right there to select by hand.
    }
  }

  return (
    <button
      onClick={copy}
      className="hover-lift"
      aria-label={`Copy "${INSTALL_COMMAND}" to clipboard`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 16px",
        marginBottom: 26,
        background: "#0C0C0E",
        border: "1px solid #27272A",
        borderRadius: 8,
        fontFamily: MONO,
        fontSize: 13,
        color: "#E4E4E7",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ color: "#3F3F46" }}>$</span>
      <span>{INSTALL_COMMAND}</span>
      <span style={{ marginLeft: 8, fontSize: 10, color: copied ? "#10B981" : "#52525B", letterSpacing: 1, textTransform: "uppercase" }}>
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

// ---------- Embers ----------
/**
 * Decorative sparks drifting up behind the hero. Deterministic offsets —
 * random values would differ between the server and client render and
 * trigger a hydration mismatch.
 */
function Embers() {
  // Vary the starting height as well as the timing — with a shared baseline
  // any single frame lines them up into what reads as a stray dotted rule.
  const sparks = [
    { left: "8%", bottom: 40, delay: "0s", duration: "7s" },
    { left: "19%", bottom: 130, delay: "1.4s", duration: "5.5s" },
    { left: "31%", bottom: 210, delay: "3.1s", duration: "6.4s" },
    { left: "47%", bottom: 80, delay: "2.2s", duration: "8s" },
    { left: "62%", bottom: 260, delay: "4.6s", duration: "6s" },
    { left: "74%", bottom: 160, delay: "0.8s", duration: "7.4s" },
    { left: "88%", bottom: 100, delay: "3.7s", duration: "5.8s" },
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="ember"
          style={{
            left: s.left,
            bottom: s.bottom,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
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
  const [tab, setTab] = useState<"leaderboard" | "clubs" | "h2h" | "badges">("leaderboard");
  // Board scope: the world, or just people you've actually added.
  const [scope, setScope] = useState<Scope>("world");
  const [scopedUsers, setScopedUsers] = useState<UserStats[] | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
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

  const [challengeBusy, setChallengeBusy] = useState(false);

  // Clubs state
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubDesc, setNewClubDesc] = useState("");
  const [newClubBudget, setNewClubBudget] = useState("");
  const [newClubPrivate, setNewClubPrivate] = useState(false);
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
  const [clubBudgetDraft, setClubBudgetDraft] = useState("");
  const [clubWebhookDraft, setClubWebhookDraft] = useState("");
  const [clubWebhookTest, setClubWebhookTest] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [clubPrivateDraft, setClubPrivateDraft] = useState(false);
  const [clubBlockIngestDraft, setClubBlockIngestDraft] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [teamApiKey, setTeamApiKey] = useState<string | null>(null);
  const [teamKeyLabel, setTeamKeyLabel] = useState("");
  const [teamKeyBudget, setTeamKeyBudget] = useState("");
  const [teamKeys, setTeamKeys] = useState<TeamKey[]>([]);
  const [teamKeyLimit, setTeamKeyLimit] = useState(2);
  const [savingClubBudget, setSavingClubBudget] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
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

  /**
   * "Challenge Them" on the H2H tab: spin up a 7-day sprint against whoever
   * is on the right side of the comparison and drop the user straight onto
   * the challenge page with the invite link ready to share.
   */
  async function challengeOpponent(opponent: string) {
    if (!currentUsername) {
      window.location.href = "/api/auth/signin?callbackUrl=/challenges";
      return;
    }
    setChallengeBusy(true);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `${currentUsername} vs ${opponent}`,
          type: "sprint",
          days: 7,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        challenge?: { url: string };
      };
      if (data.ok && data.challenge) window.location.href = data.challenge.url;
      else alert(data.message ?? "Couldn't start that challenge.");
    } catch {
      alert("Network error — try again.");
    } finally {
      setChallengeBusy(false);
    }
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
          monthlyBudgetTokens: Number(newClubBudget) || 0,
          isPrivate: newClubPrivate,
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
      setNewClubBudget("");
      setNewClubPrivate(false);
      setClubImage(null);
      fetchClubs();
    } finally {
      setClubCreating(false);
    }
  }

  async function handleJoinLeave(clubId: string, isMember: boolean) {
    setClubError(null);
    const action = isMember ? "leave" : "join";
    const needsInvite = activeClub?.id === clubId && activeClub.isPrivate && !isMember;
    const res = await fetch(`/api/clubs/${clubId}/${action}`, {
      method: "POST",
      headers: needsInvite ? { "Content-Type": "application/json" } : undefined,
      body: needsInvite ? JSON.stringify({ inviteCode: joinInviteCode.trim() }) : undefined,
    });
    if (res.ok) {
      setJoinInviteCode("");
      fetchClubs();
      if (activeClub?.id === clubId) openClub(clubId);
    } else if (needsInvite) {
      setClubError("Valid invite code required");
    }
  }

  async function openClub(clubId: string) {
    setClubDetailLoading(true);
    setClubSubTab("leaderboard");
    try {
      const [detailRes, annRes] = await Promise.all([
        fetch(`/api/clubs/${clubId}`),
        currentUsername ? fetch(`/api/clubs/${clubId}/announcements`) : Promise.resolve(null),
      ]);
      if (detailRes.ok) {
        const d = await detailRes.json();
        setActiveClub(d.club);
        setClubBudgetDraft(String(d.club?.monthlyBudgetTokens ?? 0));
        setClubWebhookDraft(d.club?.budgetWebhookUrl ?? "");
        setClubWebhookTest("idle");
        setClubPrivateDraft(d.club?.isPrivate === true);
        setClubBlockIngestDraft(d.club?.blockIngestOnBudget === true);
        setJoinInviteCode("");
        setTeamApiKey(null);
        setTeamKeyLabel("");
        setTeamKeyBudget("");
        setUpgradeStatus("idle");
        setTeamKeys([]);
        setTeamKeyLimit(d.club?.limits?.teamKeyLimit ?? 2);
        if (d.club?.isOwner) fetchTeamKeys(clubId);
      }
      if (annRes?.ok) {
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

  async function saveClubBudget() {
    if (!activeClub) return;
    setSavingClubBudget(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudgetTokens: Number(clubBudgetDraft) || 0,
          budgetWebhookUrl: clubWebhookDraft,
          isPrivate: clubPrivateDraft,
          blockIngestOnBudget: clubBlockIngestDraft,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveClub({
          ...activeClub,
          monthlyBudgetTokens: data.club.monthlyBudgetTokens,
          budgetWebhookUrl: data.club.budgetWebhookUrl,
          blockIngestOnBudget: data.club.blockIngestOnBudget,
          isPrivate: data.club.isPrivate,
          inviteCode: data.club.inviteCode,
        });
        fetchClubs();
      }
    } finally {
      setSavingClubBudget(false);
    }
  }

  async function rotateClubInvite() {
    if (!activeClub) return;
    setSavingClubBudget(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudgetTokens: Number(clubBudgetDraft) || 0,
          isPrivate: true,
          rotateInvite: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setClubPrivateDraft(true);
        setActiveClub({
          ...activeClub,
          isPrivate: true,
          inviteCode: data.club.inviteCode,
          monthlyBudgetTokens: data.club.monthlyBudgetTokens,
        });
        fetchClubs();
      }
    } finally {
      setSavingClubBudget(false);
    }
  }

  async function testClubWebhook() {
    if (!activeClub) return;
    setClubWebhookTest("sending");
    const res = await fetch(`/api/clubs/${activeClub.id}/webhook/test`, { method: "POST" });
    setClubWebhookTest(res.ok ? "ok" : "error");
  }

  async function requestClubUpgrade() {
    if (!activeClub) return;
    setUpgradeStatus("saving");
    const res = await fetch(`/api/clubs/${activeClub.id}/upgrade-request`, { method: "POST" });
    setUpgradeStatus(res.ok ? "done" : "error");
  }

  async function createTeamApiKey() {
    if (!activeClub) return;
    setKeyLoading(true);
    try {
      const res = await fetch(`/api/clubs/${activeClub.id}/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: teamKeyLabel, monthlyBudgetTokens: Number(teamKeyBudget) || 0 }),
      });
      const data = (await res.json()) as { key?: string };
      if (data.key) {
        setTeamApiKey(data.key);
        setTeamKeyLabel("");
        setTeamKeyBudget("");
        fetchTeamKeys(activeClub.id);
      }
    } finally {
      setKeyLoading(false);
    }
  }

  async function fetchTeamKeys(clubId: string) {
    const res = await fetch(`/api/clubs/${clubId}/key`);
    if (!res.ok) return;
    const data = (await res.json()) as { keys?: TeamKey[]; limit?: number };
    setTeamKeys(data.keys ?? []);
    setTeamKeyLimit(data.limit ?? 5);
  }

  async function revokeTeamKey(keyId: string) {
    if (!activeClub) return;
    const res = await fetch(`/api/clubs/${activeClub.id}/key`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) setTeamKeys((prev) => prev.filter((k) => k.id !== keyId));
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
  // Use liveUsers for rendering but keep original users as fallback.
  // A non-world scope is fetched client-side and takes precedence.
  const activeUsers = scopedUsers ?? liveUsers;

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

  useEffect(() => {
    if (scope === "world") {
      setScopedUsers(null);
      return;
    }
    let cancelled = false;
    setScopeLoading(true);
    fetch(`/api/leaderboard?scope=${scope}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok: boolean; users?: UserStats[] }) => {
        if (!cancelled) setScopedUsers(d.ok ? (d.users ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) setScopedUsers([]);
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

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
  const h2hMetrics =
    h2hLeft && h2hRight
      ? compareUsers(h2hLeft, h2hRight, formatTokens, (v) => formatUSD(v * DOLLARS_PER_TOKEN))
      : [];
  const h2hVerdict =
    h2hLeft && h2hRight
      ? verdictOf(h2hMetrics, h2hLeft.name, h2hRight.name)
      : { left: 0, right: 0, ties: 0, winner: "draw" as const, summary: "" };
  const h2hWins = { left: h2hVerdict.left, right: h2hVerdict.right };
  const activeClubBudgetPct = activeClub
    ? budgetPct(activeClub.monthlyTokens, activeClub.monthlyBudgetTokens)
    : 0;
  const activeClubBudgetColor =
    activeClubBudgetPct >= 100 ? "#EF4444" : activeClubBudgetPct >= 80 ? "#D97706" : "#10B981";

  return (
    <div style={styles.app}>
      <div style={styles.noise} />
      <div style={styles.glow} />

      <div style={styles.container}>
        {/* Landing page for unauthenticated visitors. Marketing lives in
            Landing.tsx; this file stays the product surface. */}
        {!currentUsername && (
          <Landing
            stats={{
              totalBurned: globalStats.totalBurned,
              weeklyTotal: globalStats.weeklyTotal,
              activeUsers: globalStats.activeUsers,
            }}
            signInAction={signInAction}
          />
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
              ] as const
            ).map(([key, label]) => (
              <button key={key} style={styles.navBtn(tab === key)} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
            {/* Challenges own a real URL (invite links are the whole point),
                so this is a link out rather than another local tab. */}
            <a href="/challenges" style={{ ...styles.navBtn(false), textDecoration: "none" }}>
              Challenges
            </a>
          </nav>
        </div>

        {/* Hero Stats */}
        <div className="hero-stats" style={styles.heroStats}>
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
            <BoardScope
              scope={scope}
              onScope={setScope}
              signedIn={Boolean(currentUsername)}
              onFriendChange={() => setScope((s) => s)}
            />
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>
                {scope === "friends" ? "Friends" : "Leaderboard"}
                {scopeLoading && <span style={{ color: "#3F3F46", fontSize: 10 }}> · loading</span>}
              </div>
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
              className="leaderboard-grid"
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
                  className="leaderboard-grid"
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

                  <label style={{ fontSize: 10, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: MONO, display: "block", marginBottom: 6 }}>
                    Monthly Token Budget
                  </label>
                  <input
                    value={newClubBudget}
                    onChange={(e) => setNewClubBudget(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="5000000"
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
                      marginBottom: 20,
                      boxSizing: "border-box",
                    }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 12, color: "#A1A1AA", fontFamily: MONO }}>
                    <input
                      type="checkbox"
                      checked={newClubPrivate}
                      onChange={(e) => setNewClubPrivate(e.target.checked)}
                    />
                    Private team, invite required
                  </label>

                  {/* Error */}
                  {clubError && (
                    <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 14, fontFamily: MONO, padding: "8px 12px", background: "#EF444410", borderRadius: 6, border: "1px solid #EF444433" }}>
                      {clubError}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setShowCreateClub(false); setNewClubName(""); setNewClubDesc(""); setNewClubBudget(""); setNewClubPrivate(false); setClubImage(null); setClubError(null); }}
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
                    {club.isPrivate && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#A1A1AA", background: "#18181B", padding: "4px 10px", borderRadius: 4, border: "1px solid #27272A", fontFamily: MONO, letterSpacing: 0.5 }}>PRIVATE</span>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#FAFAFA" }}>{activeClub.name}</div>
                        {activeClub.isPrivate && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#A1A1AA", background: "#18181B", padding: "3px 8px", borderRadius: 4, border: "1px solid #27272A", fontFamily: MONO, letterSpacing: 0.5 }}>PRIVATE</span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", background: "#10B98110", padding: "3px 8px", borderRadius: 4, border: "1px solid #10B98133", fontFamily: MONO, letterSpacing: 0.5 }}>{activeClub.plan.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>/{activeClub.slug} · {activeClub.memberCount}/{activeClub.limits.memberLimit} members · owned by @{activeClub.owner.username}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {activeClub.isMember && (
                        <>
                          <input
                            type="date"
                            value={reportFrom}
                            onChange={(e) => setReportFrom(e.target.value)}
                            aria-label="Report start date"
                            style={{ background: "#0F0F11", border: "1px solid #27272A", borderRadius: 6, color: "#A1A1AA", fontFamily: MONO, fontSize: 11, padding: "7px 8px", maxWidth: 136 }}
                          />
                          <input
                            type="date"
                            value={reportTo}
                            onChange={(e) => setReportTo(e.target.value)}
                            aria-label="Report end date"
                            style={{ background: "#0F0F11", border: "1px solid #27272A", borderRadius: 6, color: "#A1A1AA", fontFamily: MONO, fontSize: 11, padding: "7px 8px", maxWidth: 136 }}
                          />
                          <a
                            href={clubReportHref(activeClub.id, reportFrom, reportTo)}
                            style={{ padding: "8px 12px", background: "transparent", color: "#D97706", border: "1px solid #27272A", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: MONO, textDecoration: "none" }}
                          >
                            Export CSV
                          </a>
                        </>
                      )}
                      {currentUsername && !activeClub.isOwner && (!activeClub.isPrivate || activeClub.isMember) && (
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
                  </div>
                  {activeClub.description && (
                    <div style={{ fontSize: 13, color: "#A1A1AA", marginBottom: 16 }}>{activeClub.description}</div>
                  )}
                  {activeClub.isPrivate && !activeClub.isMember && !activeClub.isOwner && currentUsername && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                      <input
                        value={joinInviteCode}
                        onChange={(e) => setJoinInviteCode(e.target.value)}
                        placeholder="Invite code"
                        style={{ flex: 1, minWidth: 0, background: "#0F0F11", border: "1px solid #27272A", borderRadius: 6, color: "#E4E4E7", fontFamily: MONO, fontSize: 12, padding: "9px 12px", outline: "none" }}
                      />
                      <button
                        onClick={() => handleJoinLeave(activeClub.id, false)}
                        style={{ ...primaryBtn, padding: "9px 14px", fontSize: 10 }}
                      >
                        Join
                      </button>
                    </div>
                  )}
                  {clubError && (
                    <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 14, fontFamily: MONO, padding: "8px 12px", background: "#EF444410", borderRadius: 6, border: "1px solid #EF444433" }}>
                      {clubError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 20, fontSize: 11, fontFamily: MONO }}>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>Total </span><span style={{ color: "#D97706", fontWeight: 700 }}>{formatTokens(activeClub.totalTokens)}</span></div>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>This Week </span><span style={{ color: "#FAFAFA", fontWeight: 700 }}>{formatTokens(activeClub.weeklyTokens)}</span></div>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>MTD </span><span style={{ color: "#FAFAFA", fontWeight: 700 }}>{formatTokens(activeClub.monthlyTokens)}</span></div>
                    <div><span style={{ color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>Est API Cost </span><span style={{ color: "#A1A1AA", fontWeight: 700 }}>{formatUSD(estSpend(activeClub.totalTokens))}</span></div>
                  </div>
                  <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #18181B" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1 }}>
                        Monthly Budget
                      </div>
                      <div style={{ fontSize: 11, color: activeClubBudgetColor, fontFamily: MONO, fontWeight: 700 }}>
                        {activeClub.monthlyBudgetTokens > 0
                          ? `${activeClubBudgetPct}% of ${formatTokens(activeClub.monthlyBudgetTokens)}`
                          : "Not set"}
                      </div>
                    </div>
                    <div style={{ height: 8, background: "#18181B", borderRadius: 999, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(activeClubBudgetPct, 100)}%`,
                          height: "100%",
                          background: activeClub.monthlyBudgetTokens > 0 ? activeClubBudgetColor : "#27272A",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    {activeClub.isOwner && activeClub.plan !== "enterprise" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                        <button
                          onClick={requestClubUpgrade}
                          disabled={upgradeStatus === "saving" || upgradeStatus === "done"}
                          style={{
                            background: "transparent",
                            color: upgradeStatus === "done" ? "#10B981" : "#D97706",
                            border: "1px solid #27272A",
                            borderRadius: 6,
                            fontSize: 10,
                            fontFamily: MONO,
                            fontWeight: 700,
                            padding: "8px 10px",
                            cursor: upgradeStatus === "saving" || upgradeStatus === "done" ? "default" : "pointer",
                          }}
                        >
                          {upgradeStatus === "saving" ? "Requesting" : upgradeStatus === "done" ? "Upgrade requested" : "Request upgrade"}
                        </button>
                        <span style={{ fontSize: 10, color: upgradeStatus === "error" ? "#EF4444" : "#52525B", fontFamily: MONO }}>
                          {upgradeStatus === "error"
                            ? "Add email on account or use teams page"
                            : `${activeClub.memberCount}/${activeClub.limits.memberLimit} members · ${teamKeys.length}/${teamKeyLimit} team keys`}
                        </span>
                      </div>
                    )}
                    {activeClub.isOwner && (
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#A1A1AA", fontFamily: MONO }}>
                          <input
                            type="checkbox"
                            checked={clubPrivateDraft}
                            onChange={(e) => setClubPrivateDraft(e.target.checked)}
                          />
                          Private team
                        </label>
                        {clubPrivateDraft && activeClub.inviteCode && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <code style={{ flex: 1, minWidth: 0, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#D97706", fontFamily: MONO, fontSize: 12, padding: "9px 12px", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {activeClub.inviteCode}
                            </code>
                            <button onClick={rotateClubInvite} style={{ background: "transparent", color: "#52525B", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "9px 10px", cursor: "pointer" }}>
                              Rotate
                            </button>
                          </div>
                        )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={clubBudgetDraft}
                          onChange={(e) => setClubBudgetDraft(e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          aria-label="Monthly token budget"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "#0F0F11",
                            border: "1px solid #18181B",
                            borderRadius: 6,
                            color: "#E4E4E7",
                            fontFamily: MONO,
                            fontSize: 12,
                            padding: "9px 12px",
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={saveClubBudget}
                          disabled={savingClubBudget}
                          style={{ ...primaryBtn, padding: "9px 14px", fontSize: 10, opacity: savingClubBudget ? 0.6 : 1 }}
                        >
                          {savingClubBudget ? "Saving" : "Save"}
                        </button>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#A1A1AA", fontFamily: MONO }}>
                        <input
                          type="checkbox"
                          checked={clubBlockIngestDraft}
                          onChange={(e) => setClubBlockIngestDraft(e.target.checked)}
                        />
                        Reject team-key ingest when MTD budget is spent
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={clubWebhookDraft}
                          onChange={(e) => {
                            setClubWebhookDraft(e.target.value);
                            setClubWebhookTest("idle");
                          }}
                          placeholder="https://hooks.example.com/burnlog-budget"
                          aria-label="Budget webhook URL"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "#0F0F11",
                            border: "1px solid #18181B",
                            borderRadius: 6,
                            color: "#E4E4E7",
                            fontFamily: MONO,
                            fontSize: 12,
                            padding: "9px 12px",
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={testClubWebhook}
                          disabled={clubWebhookTest === "sending" || !activeClub.budgetWebhookUrl || clubWebhookDraft !== activeClub.budgetWebhookUrl}
                          style={{ background: "transparent", color: clubWebhookTest === "ok" ? "#10B981" : clubWebhookTest === "error" ? "#EF4444" : "#52525B", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "9px 10px", cursor: clubWebhookTest === "sending" || !activeClub.budgetWebhookUrl || clubWebhookDraft !== activeClub.budgetWebhookUrl ? "not-allowed" : "pointer" }}
                        >
                          {clubWebhookTest === "sending" ? "Testing" : clubWebhookTest === "ok" ? "OK" : clubWebhookTest === "error" ? "Failed" : "Test"}
                        </button>
                      </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            value={teamKeyLabel}
                            onChange={(e) => setTeamKeyLabel(e.target.value)}
                            placeholder="github-actions"
                            aria-label="Team API key label"
                            maxLength={60}
                            style={{ flex: 1, minWidth: 0, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#E4E4E7", fontFamily: MONO, fontSize: 12, padding: "9px 12px", outline: "none" }}
                          />
                          <input
                            value={teamKeyBudget}
                            onChange={(e) => setTeamKeyBudget(e.target.value.replace(/\D/g, ""))}
                            placeholder="key monthly cap"
                            aria-label="Team API key monthly budget"
                            inputMode="numeric"
                            style={{ width: 150, minWidth: 0, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#E4E4E7", fontFamily: MONO, fontSize: 12, padding: "9px 12px", outline: "none" }}
                          />
                          <button
                            onClick={createTeamApiKey}
                            disabled={keyLoading || teamKeys.length >= teamKeyLimit}
                            style={{ background: "transparent", color: teamKeys.length >= teamKeyLimit ? "#52525B" : "#D97706", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "9px 10px", cursor: keyLoading ? "wait" : teamKeys.length >= teamKeyLimit ? "not-allowed" : "pointer" }}
                          >
                            {keyLoading ? "Generating" : teamKeys.length >= teamKeyLimit ? "Key Limit Reached" : "Generate Team API Key"}
                          </button>
                          {teamApiKey && (
                            <button
                              onClick={() => copyToClip("team-key", teamApiKey)}
                              style={{ background: "transparent", color: "#52525B", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "9px 10px", cursor: "pointer" }}
                            >
                              {copied === "team-key" ? "Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                        {teamApiKey && (
                          <code style={{ display: "block", background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#D97706", fontFamily: MONO, fontSize: 11, padding: "9px 12px", overflowWrap: "anywhere" }}>
                            {teamApiKey}
                          </code>
                        )}
                        {teamKeys.length > 0 && (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>
                              {teamKeys.length}/{teamKeyLimit} active team keys
                            </div>
                            {teamKeys.map((k) => (
                              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, padding: "8px 10px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, color: "#E4E4E7", fontFamily: MONO, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {k.label ?? "team key"}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>
                                    MTD {formatTokens(k.monthlyTokens)}{k.monthlyBudgetTokens > 0 ? ` / ${formatTokens(k.monthlyBudgetTokens)}` : ""} · last used {relativeTime(k.lastUsed)} · created {relativeTime(k.createdAt)}
                                  </div>
                                </div>
                                <button
                                  onClick={() => revokeTeamKey(k.id)}
                                  style={{ background: "transparent", color: "#EF4444", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "6px 8px", cursor: "pointer" }}
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
                {clubSubTab === "feed" && (
                  <ClubFeed clubId={activeClub.id} isMember={activeClub.isMember} />
                )}
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
                style={{ ...primaryBtn, opacity: challengeBusy ? 0.6 : 1 }}
                disabled={challengeBusy}
                onClick={() => challengeOpponent(h2hRight.username)}
              >
                {challengeBusy ? "Starting…" : "Challenge Them"}
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
                const outcome = outcomeOf(m);
                const leftWin = outcome === "left";
                const rightWin = outcome === "right";
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
                      <div style={{ fontSize: 8, color: "#27272A", textTransform: "none", letterSpacing: 0, marginTop: 3 }}>
                        {m.unscored ? "context only" : m.hint}
                      </div>
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
              {h2hVerdict.summary && (
                <div
                  style={{
                    marginTop: 18,
                    padding: "14px 18px",
                    borderRadius: 10,
                    background: h2hVerdict.winner === "draw" ? "#0F0F11" : "#D9770610",
                    border: `1px solid ${h2hVerdict.winner === "draw" ? "#18181B" : "#D9770633"}`,
                  }}
                >
                  <div style={{ fontSize: 14, color: "#E4E4E7", lineHeight: 1.6 }}>{h2hVerdict.summary}</div>
                  <div style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginTop: 8, lineHeight: 1.6 }}>
                    Last 30 days only, so tenure doesn&apos;t decide it. Within 5% counts as a tie.
                  </div>
                </div>
              )}
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
                {`[![burnlog](https://burnlog.net/badge/${selectedUser.username}.svg)](https://burnlog.net/@${selectedUser.username})`}
              </div>

              <div style={styles.codeBlock}>
                <div style={{ fontSize: 10, color: "#3F3F46", marginBottom: 6 }}>HTML</div>
                {`<a href="https://burnlog.net/@${selectedUser.username}"><img src="https://burnlog.net/badge/${selectedUser.username}.svg" alt="burnlog" /></a>`}
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

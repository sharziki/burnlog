"use client";

import { useEffect, useRef, useState } from "react";
import { Landing } from "./Landing";
import { BoardScope, type Scope } from "./BoardScope";
import { ClubFeed } from "./ClubFeed";
import { GetStarted } from "./GetStarted";
import { getRank } from "@/lib/ranks";
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

// A UA checkbox renders 13x13. That's a miss on a phone even when the label
// beside it is tappable, so give it real size everywhere it appears.
const CHECKBOX: React.CSSProperties = { width: 18, height: 18, flexShrink: 0, accentColor: "#D97706" };

export function Burnlog({
  users,
  currentUsername,
  signOutAction,
  signInAction,
  full = true,
}: {
  users: UserStats[];
  currentUsername: string | null;
  signOutAction?: () => Promise<void>;
  signInAction?: () => Promise<void>;
  /** False on a core deployment: the board is leaderboard-only. */
  full?: boolean;
}) {
  const [tab, setTab] = useState<"leaderboard" | "clubs">("leaderboard");
  // Board scope: the world, or just people you've actually added.
  const [scope, setScope] = useState<Scope>("world");
  const [scopedUsers, setScopedUsers] = useState<UserStats[] | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(
    (currentUsername && users.find((u) => u.username === currentUsername)) || users[0] || null,
  );
  const [timeframe, setTimeframe] = useState<"all-time" | "weekly">("all-time");
  const [mounted, setMounted] = useState(false);

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
  const [keyLoading, setKeyLoading] = useState(false);

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
      gridTemplateColumns: "40px 1fr 140px 100px 118px",
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
            Run <code style={{ color: "#D97706" }}>npx @sxnalabs/burnlog</code> to light it up.
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
            full={full}
          />
        )}


        {/* Tab nav. A core deployment shows the board alone — one tab is no
            tab, so the strip is dropped rather than left as a lone button. */}
        <div style={{ paddingTop: 20 }} id="leaderboard">
          {full && (
            <nav style={styles.nav}>
              {(
                [
                  ["leaderboard", "Leaderboard"],
                  ["clubs", "Clubs"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} style={styles.navBtn(tab === key)} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div style={styles.section}>
            {/* These totals describe the board, so they live inside it — the
                Clubs tab prints its own four-up row. */}
            <div className="hero-stats" style={styles.heroStats}>
              {[
                { label: "Total Burned", value: globalStats.totalBurned },
                { label: "This Week", value: globalStats.weeklyTotal },
                { label: "Active Burners", value: globalStats.activeUsers },
                { label: "Avg / User", value: globalStats.avgPerUser },
              ].map((s, i) => (
                <div key={i} style={styles.statCard}>
                  <div style={styles.statLabel}>{s.label}</div>
                  <div style={styles.statValue}>
                    {mounted ? <AnimCount value={s.value} /> : formatTokens(s.value)}
                  </div>
                </div>
              ))}
            </div>
            {/* The checklist is the first thing a new account should see and it
                hides itself once all four steps are done, so it sits above the
                scope switch rather than below the table header. */}
            {currentUsername && <GetStarted username={currentUsername} full={full} />}
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
                gridTemplateColumns: "40px 1fr 140px 100px 118px",
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
              const isEmpty = user.totalTokens === 0;
              return (
                <a
                  key={user.id}
                  href={`/u/${user.username}`}
                  className="leaderboard-grid"
                  style={{
                    ...styles.leaderboardRow(selectedUser.id === user.id, i),
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={styles.rankNum(i)}>{i + 1}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <UserAvatar user={user} size={36} color={r.color} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{user.name}</div>
                      {/* The whole row is already the link; nesting another
                          anchor here would be invalid HTML. */}
                      <span style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>
                        @{user.username}
                      </span>
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
                      // "Heat Death" and "Event Horizon" wrapped to two lines in
                      // the old 80px track, which knocked the row heights out.
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.icon} {r.name}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* CLUBS TAB */}
        {full && tab === "clubs" && (
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
                    Private club, invite required
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
                {/* Wrapping instead of competing for one row: at phone width
                    the name, slug and meta each broke over 2-3 lines. */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                    {club.image ? (
                      <img src={club.image} alt={club.name} width={44} height={44} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #18181B" }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg, #D9770622 0%, #D9770608 100%)", border: "1px solid #D9770633", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#D97706", fontFamily: MONO }}>
                        {club.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>{club.name}</div>
                      <div style={{ fontSize: 11, color: "#52525B", fontFamily: MONO }}>/{club.slug}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                    {activeClub.image ? (
                      <img src={activeClub.image} alt={activeClub.name} width={56} height={56} style={{ borderRadius: 12, objectFit: "cover", border: "1px solid #18181B" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg, #D9770622 0%, #D9770608 100%)", border: "1px solid #D9770633", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#D97706", fontFamily: MONO }}>
                        {activeClub.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
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
                  <div className="club-stats" style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11, fontFamily: MONO }}>
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
                            ? "Add email on account or use the pricing page"
                            : `${activeClub.memberCount}/${activeClub.limits.memberLimit} members · ${teamKeys.length}/${teamKeyLimit} club keys`}
                        </span>
                      </div>
                    )}
                    {activeClub.isOwner && (
                      // minmax(0, 1fr): the implicit `auto` track took its
                      // max-content width from the input+button rows below,
                      // which on a phone put Save/Test/Revoke outside the
                      // viewport inside an overflow:hidden ancestor — unclipped
                      // and untappable, not merely scrolled off.
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, marginTop: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#A1A1AA", fontFamily: MONO }}>
                          <input
                            type="checkbox"
                            checked={clubPrivateDraft}
                            onChange={(e) => setClubPrivateDraft(e.target.checked)}
                            style={CHECKBOX}
                          />
                          Private club
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#A1A1AA", fontFamily: MONO, minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={clubBlockIngestDraft}
                          onChange={(e) => setClubBlockIngestDraft(e.target.checked)}
                          style={CHECKBOX}
                        />
                        Reject club-key ingest when MTD budget is spent
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            value={teamKeyLabel}
                            onChange={(e) => setTeamKeyLabel(e.target.value)}
                            placeholder="github-actions"
                            aria-label="Club API key label"
                            maxLength={60}
                            style={{ flex: 1, minWidth: 0, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#E4E4E7", fontFamily: MONO, fontSize: 12, padding: "9px 12px", outline: "none" }}
                          />
                          <input
                            value={teamKeyBudget}
                            onChange={(e) => setTeamKeyBudget(e.target.value.replace(/\D/g, ""))}
                            placeholder="key monthly cap"
                            aria-label="Club API key monthly budget"
                            inputMode="numeric"
                            style={{ flex: "1 1 120px", minWidth: 0, maxWidth: 150, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, color: "#E4E4E7", fontFamily: MONO, fontSize: 12, padding: "9px 12px", outline: "none" }}
                          />
                          <button
                            onClick={createTeamApiKey}
                            disabled={keyLoading || teamKeys.length >= teamKeyLimit}
                            style={{ background: "transparent", color: teamKeys.length >= teamKeyLimit ? "#52525B" : "#D97706", border: "1px solid #27272A", borderRadius: 6, fontSize: 10, fontFamily: MONO, padding: "9px 10px", cursor: keyLoading ? "wait" : teamKeys.length >= teamKeyLimit ? "not-allowed" : "pointer" }}
                          >
                            {keyLoading ? "Generating" : teamKeys.length >= teamKeyLimit ? "Key Limit Reached" : "Generate Club API Key"}
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
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
                            <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO }}>
                              {teamKeys.length}/{teamKeyLimit} active club keys
                            </div>
                            {teamKeys.map((k) => (
                              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0F0F11", border: "1px solid #18181B", borderRadius: 6, padding: "8px 10px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, color: "#E4E4E7", fontFamily: MONO, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {k.label ?? "club key"}
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
                    <div className="club-grid" style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) 120px 100px", padding: "0 16px 8px", fontSize: 10, color: "#3F3F46", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>
                      <span>#</span><span>Member</span><span>Weekly</span><span>Total</span>
                    </div>
                    {activeClub.members.map((m, i) => {
                      const r = getRank(m.totalTokens);
                      return (
                        <div key={m.id} className="club-grid" style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) 120px 100px", alignItems: "center", padding: "12px 16px", borderRadius: 10, background: i % 2 === 0 ? "#0C0C0E" : "transparent", border: "1px solid transparent", marginBottom: 2 }}>
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

      </div>

    </div>
  );
}

"use client";

import { formatTokens } from "@/lib/format";
import { useState } from "react";

type UsageSummary = {
  totalTokens: number;
  weeklyTokens: number;
  events: number;
  lastActive: string | null;
  hasSyncedData: boolean;
};

const MONO = "'JetBrains Mono', monospace";
const SANS = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok;
}

function cardStyle(accent = false) {
  return {
    background: accent
      ? "linear-gradient(180deg, rgba(217,119,6,0.10) 0%, rgba(10,10,10,0.98) 58%)"
      : "#0A0A0A",
    border: accent ? "1px solid rgba(217,119,6,0.24)" : "1px solid #141414",
    borderRadius: 18,
    padding: 28,
    boxShadow: accent ? "0 20px 60px rgba(0,0,0,0.32)" : "none",
  } as const;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "#0D0D0D",
        border: "1px solid #18181B",
        borderRadius: 12,
        padding: "16px 18px",
        minHeight: 92,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#6B7280",
          letterSpacing: 1.3,
          textTransform: "uppercase",
          marginBottom: 8,
          fontFamily: MONO,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#FAFAFA", fontFamily: MONO }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "#71717A", marginTop: 6, lineHeight: 1.5 }}>{sub}</div> : null}
    </div>
  );
}

function ChecklistItem({
  step,
  title,
  detail,
  code,
  done = false,
}: {
  step: string;
  title: string;
  detail: string;
  code?: string;
  done?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "14px 0",
        borderTop: "1px solid #171717",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: done ? "#D97706" : "#111111",
          border: done ? "1px solid #D97706" : "1px solid #2A2A2A",
          color: done ? "#090909" : "#A1A1AA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 800,
          fontFamily: MONO,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {done ? "✓" : step}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA", marginBottom: 5 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65 }}>{detail}</div>
        {code ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#0D0D0D",
              border: "1px solid #1F1F1F",
              color: "#F59E0B",
              fontSize: 12,
              fontFamily: MONO,
              overflowX: "auto",
            }}
          >
            <code>{code}</code>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsClient({
  username,
  name,
  image,
  usage,
  signOutAction,
}: {
  username: string;
  name: string;
  image: string | null;
  usage: UsageSummary;
  signOutAction: () => Promise<void>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileAction, setProfileAction] = useState<string | null>(null);

  const profileUrl = typeof window !== "undefined" ? `${window.location.origin}/u/${username}` : `/u/${username}`;

  async function createKey() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/me/key", { method: "POST" });
      const data = (await res.json()) as { key?: string; message?: string };
      if (data.key) {
        setKey(data.key);
        setMessage(data.message ?? "New CLI key created.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyProfileLink() {
    const ok = await copyText(profileUrl);
    setProfileAction(ok ? "Profile link copied" : "Copy failed");
    setTimeout(() => setProfileAction(null), 1800);
  }

  async function shareProfile() {
    if (typeof window === "undefined") return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `@${username} on burnlog`,
          text: `${name} is tracking token burn on burnlog.`,
          url: profileUrl,
        });
        setProfileAction("Profile shared");
      } else {
        const ok = await copyText(profileUrl);
        setProfileAction(ok ? "Profile link copied" : "Copy failed");
      }
      setTimeout(() => setProfileAction(null), 1800);
    } catch {}
  }

  const statusTone = usage.hasSyncedData ? "#10B981" : "#F59E0B";

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "48px 24px 72px",
        fontFamily: MONO,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase" }}>burnlog</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginTop: 4, fontFamily: SANS }}>settings</div>
          <div style={{ fontSize: 13, color: "#71717A", marginTop: 8, maxWidth: 560, lineHeight: 1.6 }}>
            Get to your first tracked burn fast, verify that sync is actually working, and keep your CLI setup honest.
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              padding: "9px 14px",
              background: "transparent",
              color: "#9CA3AF",
              border: "1px solid #1F1F1F",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: MONO,
            }}
          >
            Sign out
          </button>
        </form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 11, color: "#6B7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
            signed in as
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {image ? (
              <img
                src={image}
                alt={username}
                width={52}
                height={52}
                style={{ borderRadius: "50%", border: "2px solid #D9770644" }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  border: "1px solid #27272A",
                  background: "#111111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#D4D4D8",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: SANS,
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: SANS }}>{name}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>@{username}</div>
            </div>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6B7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                sync status
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#FAFAFA", fontFamily: SANS }}>
                {usage.hasSyncedData ? "Burn data detected" : "No burn detected yet"}
              </div>
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: `${statusTone}1A`,
                border: `1px solid ${statusTone}44`,
                color: statusTone,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {usage.hasSyncedData ? "Live" : "Needs first sync"}
            </div>
          </div>

          {usage.hasSyncedData ? (
            <div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65, marginBottom: 16 }}>
                burnlog has received at least one upload from your machine. These numbers reflect synced burn events only.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <StatTile label="Total tokens" value={formatTokens(usage.totalTokens)} />
                <StatTile label="Weekly tokens" value={formatTokens(usage.weeklyTokens)} />
                <StatTile label="Sync events" value={usage.events.toLocaleString()} sub="uploaded requests / sessions" />
                <StatTile label="Last active" value={relativeTime(usage.lastActive)} sub={usage.lastActive ? new Date(usage.lastActive).toLocaleString() : undefined} />
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.7, marginBottom: 14 }}>
                We have not seen any synced burn events for this account yet. Create a CLI key, log in locally, and run your first sync after a coding session.
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#0D0D0D",
                  border: "1px solid #1F1F1F",
                  color: "#D4D4D8",
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                Fastest path: generate a key below → <code style={{ color: "#F59E0B" }}>burnlog login &lt;key&gt;</code> → <code style={{ color: "#F59E0B" }}>burnlog sync</code>.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...cardStyle(true), marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#D4D4D8", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
              first burn
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#FAFAFA", fontFamily: SANS, marginBottom: 8 }}>
              Get tracking in 60 seconds.
            </div>
            <div style={{ fontSize: 13, color: "#D4D4D8", lineHeight: 1.7, maxWidth: 700 }}>
              This is the shortest honest path from signed-in account to visible burn data. Once your first sync lands, your totals and profile update automatically.
            </div>
          </div>
          <a
            href="#cli-key"
            style={{
              alignSelf: "flex-start",
              padding: "10px 14px",
              borderRadius: 10,
              background: "#F59E0B",
              color: "#090909",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Generate key ↓
          </a>
        </div>

        <ChecklistItem
          step="1"
          title="Install the CLI"
          detail="Use the burnlog CLI on the machine where Claude Code or Codex is running."
          code="npm install -g @sxnalabs/burnlog"
        />
        <ChecklistItem
          step="2"
          title="Log in with your CLI key"
          detail="Generate a key in this page, then authenticate once locally so burnlog can attribute usage to your account."
          code="burnlog login <key>"
        />
        <ChecklistItem
          step={usage.hasSyncedData ? "✓" : "3"}
          title="Run your first sync"
          detail={usage.hasSyncedData ? "Your account already has synced burn data. Run sync again any time to refresh totals." : "After you finish a coding session, run one manual sync to prove the pipeline works."}
          code="burnlog sync"
          done={usage.hasSyncedData}
        />
        <ChecklistItem
          step="4"
          title="Turn on the workflow that matches your agent"
          detail="Claude Code can install auto-sync today. Codex can scan, sync, or run the daemon today, but it does not have a dedicated auto-installer yet."
          code="burnlog install   # Claude Code autosync"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div id="cli-key" style={cardStyle()}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: SANS }}>CLI API key</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.7 }}>
            The burnlog CLI uses this key to upload local token counts. Creating a new key revokes the previous one, so only your latest CLI credential stays active.
          </div>

          <button
            onClick={createKey}
            disabled={loading}
            style={{
              padding: "10px 18px",
              background: "#D97706",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              fontFamily: MONO,
            }}
          >
            {loading ? "rotating..." : key ? "rotate CLI key" : "generate CLI key"}
          </button>

          {message ? (
            <div style={{ marginTop: 12, fontSize: 12, color: "#D97706", lineHeight: 1.6 }}>{message}</div>
          ) : null}

          {key ? (
            <div
              style={{
                marginTop: 16,
                padding: "14px 16px",
                background: "#0D0D0D",
                border: "1px solid #D9770644",
                borderRadius: 10,
                fontSize: 12,
                color: "#F59E0B",
                wordBreak: "break-all",
              }}
            >
              <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                copy this once — it won't be shown again
              </div>
              {key}
            </div>
          ) : null}

          <div style={{ marginTop: 18, fontSize: 12, color: "#9CA3AF", lineHeight: 1.8 }}>
            <div>
              <code style={{ color: "#F59E0B" }}>npm install -g @sxnalabs/burnlog</code>
            </div>
            <div>
              <code style={{ color: "#F59E0B" }}>burnlog login &lt;key&gt;</code>
            </div>
            <div>
              <code style={{ color: "#F59E0B" }}>burnlog sync</code>
            </div>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: SANS }}>Support guidance</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.7 }}>
            Current support is uneven, so this page only promises what works today.
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#0D0D0D", border: "1px solid #1F1F1F" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FAFAFA", marginBottom: 4 }}>Claude Code</div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65 }}>
                Supported today for install + autosync. Use <code style={{ color: "#F59E0B" }}>burnlog install</code> to wire up session-based syncing after login.
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#0D0D0D", border: "1px solid #1F1F1F" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FAFAFA", marginBottom: 4 }}>Codex</div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65 }}>
                Supported today for <code style={{ color: "#F59E0B" }}>scan</code>, <code style={{ color: "#F59E0B" }}>sync</code>, and <code style={{ color: "#F59E0B" }}>daemon</code>. There is no dedicated Codex auto-installer yet, so setup is still manual.
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#0D0D0D", border: "1px solid #1F1F1F" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FAFAFA", marginBottom: 4 }}>Hermes</div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65 }}>
                Use the SDK/manual integration path today. Hermes is supported for explicit tracking, but passive local log ingestion is not ready yet.
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#0D0D0D", border: "1px solid #1F1F1F" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FAFAFA", marginBottom: 4 }}>openclaw</div>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.65 }}>
                Still a stub today. Do not expect burnlog to parse local openclaw usage logs yet.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: SANS }}>Public profile</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.6 }}>
            Share your burnlog page, challenge people head-to-head, and keep your public metadata sharp once your first sync is live.
          </div>
          {usage.hasSyncedData ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={`/u/${username}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #1F1F1F",
                    color: "#E5E7EB",
                    textDecoration: "none",
                    fontSize: 12,
                  }}
                >
                  View public profile →
                </a>
                <button
                  onClick={copyProfileLink}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #1F1F1F", background: "#0D0D0D", color: "#E5E7EB", fontSize: 12, cursor: "pointer" }}
                >
                  Copy profile link
                </button>
                <button
                  onClick={shareProfile}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #D97706", background: "#D97706", color: "#090909", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Share profile
                </button>
              </div>
              {profileAction ? <div style={{ marginTop: 12, fontSize: 12, color: "#D97706" }}>{profileAction}</div> : null}
            </>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.7 }}>
                Complete your first sync to unlock a profile that is actually worth sharing.
              </div>
              <a
                href="#cli-key"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "fit-content",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #D97706",
                  background: "#D97706",
                  color: "#090909",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Generate key and sync first ↓
              </a>
              <div style={{ fontSize: 11, color: "#71717A", lineHeight: 1.7 }}>
                Fast path: <code style={{ color: "#F59E0B" }}>burnlog login &lt;key&gt;</code> → <code style={{ color: "#F59E0B" }}>burnlog sync</code>
              </div>
            </div>
          )}
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: SANS }}>What counts as activation?</div>
          <div style={{ fontSize: 12, color: "#A1A1AA", lineHeight: 1.7 }}>
            Activation here is simple: burnlog has received at least one synced burn event from your machine.
            {usage.hasSyncedData ? " You are past that milestone." : " You have not hit that milestone yet."}
          </div>
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "#0D0D0D", border: "1px solid #1F1F1F", fontSize: 12, color: "#71717A", lineHeight: 1.7 }}>
            We store usage totals and metadata for ranking, not your prompt content. If a sync never happened, your totals stay at zero here.
          </div>
        </div>
      </div>
    </div>
  );
}

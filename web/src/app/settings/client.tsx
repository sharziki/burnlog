"use client";

import { useState } from "react";

export function SettingsClient({
  username,
  name,
  image,
  signOutAction,
}: {
  username: string;
  name: string;
  image: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase" }}>burnlog</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>settings</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "#6B7280",
              border: "1px solid #1F1F1F",
              borderRadius: 6,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Sign out
          </button>
        </form>
      </div>

      <div
        style={{
          background: "#0A0A0A",
          border: "1px solid #141414",
          borderRadius: 14,
          padding: 28,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, color: "#6B7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          signed in as
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {image && (
            <img
              src={image}
              alt={username}
              width={48}
              height={48}
              style={{ borderRadius: "50%", border: "2px solid #D9770644" }}
            />
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{name}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>@{username}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#0A0A0A",
          border: "1px solid #141414",
          borderRadius: 14,
          padding: 28,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Public profile</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.6 }}>
          Share your burnlog page, challenge people head-to-head, and keep your public metadata sharp.
        </div>
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
      </div>

      <div
        style={{
          background: "#0A0A0A",
          border: "1px solid #141414",
          borderRadius: 14,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>CLI API key</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.6 }}>
          The burnlog CLI uses this key to upload local token counts. Generating a new CLI key revokes the previous one, so your latest key is always the only active CLI credential.
        </div>
        <button
          onClick={createKey}
          disabled={loading}
          style={{
            padding: "10px 18px",
            background: "#D97706",
            color: "#000",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {loading ? "rotating..." : key ? "rotate CLI key" : "generate CLI key"}
        </button>

        {message && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#D97706", lineHeight: 1.6 }}>
            {message}
          </div>
        )}

        {key && (
          <div
            style={{
              marginTop: 16,
              padding: "14px 16px",
              background: "#0D0D0D",
              border: "1px solid #D9770644",
              borderRadius: 8,
              fontSize: 12,
              color: "#D97706",
              wordBreak: "break-all",
            }}
          >
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              copy this once — it won't be shown again
            </div>
            {key}
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 12, color: "#9CA3AF", lineHeight: 1.7 }}>
          <div>
            <code style={{ color: "#D97706" }}>npm install -g @sxnalabs/burnlog</code>
          </div>
          <div>
            <code style={{ color: "#D97706" }}>burnlog login &lt;key&gt;</code>
          </div>
          <div>
            <code style={{ color: "#D97706" }}>burnlog install</code> for Claude Code auto-sync or <code style={{ color: "#D97706" }}>burnlog sync</code> anytime.
          </div>
        </div>
      </div>
    </div>
  );
}

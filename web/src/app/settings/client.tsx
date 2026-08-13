"use client";

import { useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";

export function SettingsClient({
  username,
  name,
  image,
  profile,
  signOutAction,
}: {
  username: string;
  name: string;
  image: string | null;
  profile: { bio: string; twitter: string; website: string };
  signOutAction: () => Promise<void>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");

  async function createKey() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/key", { method: "POST" });
      const data = (await res.json()) as { key?: string };
      if (data.key) setKey(data.key);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "delete my account") return;
    setDeleteStatus("deleting");
    try {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteConfirm }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setDeleteStatus("error");
      }
    } catch {
      setDeleteStatus("error");
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
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

      <div style={{ marginBottom: 16 }}>
        <a
          href={`/u/${username}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#0A0A0A",
            border: "1px solid #141414",
            borderRadius: 14,
            padding: 20,
            textDecoration: "none",
          }}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={44} height={44} style={{ borderRadius: 10 }} />
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 10, color: "#6B7280", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
              signed in as
            </span>
            <span style={{ display: "block", color: "#FAFAFA", fontSize: 15, fontWeight: 700 }}>{name}</span>
            <span style={{ display: "block", color: "#6B7280", fontSize: 11 }}>@{username}</span>
          </span>
          <span style={{ color: "#D97706", fontSize: 11 }}>view public profile →</span>
        </a>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ProfileEditor initial={profile} />
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
          Generate a key, then run <code style={{ color: "#D97706" }}>burnlog login &lt;key&gt;</code> on the machine you burn on.
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
          {loading ? "generating..." : "generate new key"}
        </button>

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
      </div>

      <div
        style={{
          background: "#0A0A0A",
          border: "1px solid #3F1D1D",
          borderRadius: 14,
          padding: 28,
          marginTop: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Delete account</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 1.6 }}>
          Permanently deletes your user profile, sessions, API keys, personal burn events, and clubs you own. Type <code style={{ color: "#EF4444" }}>delete my account</code> to confirm.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={deleteConfirm}
            onChange={(e) => {
              setDeleteConfirm(e.target.value);
              setDeleteStatus("idle");
            }}
            style={{
              flex: 1,
              minWidth: 220,
              background: "#0D0D0D",
              border: "1px solid #1F1F1F",
              borderRadius: 6,
              color: "#E4E4E7",
              fontSize: 12,
              padding: "10px 12px",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={deleteAccount}
            disabled={deleteConfirm !== "delete my account" || deleteStatus === "deleting"}
            style={{
              padding: "10px 18px",
              background: deleteConfirm === "delete my account" ? "#EF4444" : "transparent",
              color: deleteConfirm === "delete my account" ? "#000" : "#6B7280",
              border: "1px solid #3F1D1D",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: deleteStatus === "deleting" ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {deleteStatus === "deleting" ? "deleting..." : "delete account"}
          </button>
        </div>
        {deleteStatus === "error" && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#EF4444" }}>
            Delete failed. Check your session and try again.
          </div>
        )}
      </div>
    </div>
  );
}

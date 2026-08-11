"use client";

import { useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type Status = "idle" | "working" | "done" | "error";

export function CliAuthClient({
  port,
  state,
  username,
}: {
  port: number;
  state: string;
  username: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function approve() {
    setStatus("working");
    setMessage("");
    try {
      const res = await fetch("/api/me/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "cli-login" }),
      });
      if (!res.ok) {
        throw new Error(`could not mint key (${res.status})`);
      }
      const data = (await res.json()) as { key?: string };
      if (!data.key) throw new Error("no key returned");

      // Hand the key back to the CLI's localhost listener. Top-level navigation
      // to 127.0.0.1 is allowed (not blocked as mixed content).
      const url = `http://127.0.0.1:${port}/callback?key=${encodeURIComponent(
        data.key,
      )}&state=${encodeURIComponent(state)}`;
      setStatus("done");
      window.location.href = url;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  if (status === "done") {
    return (
      <p style={{ color: "#A1A1AA", maxWidth: 440, fontFamily: MONO }}>
        Connected as <span style={{ color: "#D97706" }}>@{username}</span>. You can close this tab
        and return to your terminal.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", fontFamily: MONO }}>
      <p style={{ color: "#A1A1AA", maxWidth: 440 }}>
        Connect the burnlog CLI / MCP on this machine as{" "}
        <span style={{ color: "#D97706" }}>@{username}</span>? This creates an API key stored only on
        your computer.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={approve}
          disabled={status === "working"}
          style={{
            padding: "12px 24px",
            background: "#D97706",
            color: "#09090B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: status === "working" ? "default" : "pointer",
            opacity: status === "working" ? 0.6 : 1,
            fontFamily: MONO,
            fontSize: 13,
          }}
        >
          {status === "working" ? "connecting…" : "Approve & connect"}
        </button>
        <a
          href="/"
          style={{
            padding: "12px 24px",
            background: "transparent",
            color: "#A1A1AA",
            border: "1px solid #27272A",
            borderRadius: 8,
            textDecoration: "none",
            fontFamily: MONO,
            fontSize: 13,
          }}
        >
          Cancel
        </a>
      </div>
      {status === "error" && (
        <p style={{ color: "#F87171", fontSize: 12, maxWidth: 440 }}>{message}</p>
      )}
    </div>
  );
}

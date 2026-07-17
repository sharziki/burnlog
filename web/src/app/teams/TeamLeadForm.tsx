"use client";

import { FormEvent, useState } from "react";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export function TeamLeadForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError("");

    const form = new FormData(e.currentTarget);
    const qs = new URLSearchParams(window.location.search);
    const source = qs.get("utm_source") || qs.get("ref") || "teams_page";
    const res = await fetch("/api/team-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form), source }),
    });

    if (res.ok) {
      e.currentTarget.reset();
      setStatus("done");
      return;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "submit_failed");
    setStatus("error");
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="teams-grid">
        <label style={label}>
          Work email
          <input name="email" type="email" required autoComplete="email" style={input} />
        </label>
        <label style={label}>
          Company
          <input name="company" required autoComplete="organization" style={input} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="teams-grid">
        <label style={label}>
          Name
          <input name="name" autoComplete="name" style={input} />
        </label>
        <label style={label}>
          Team size
          <select name="teamSize" defaultValue="" style={input}>
            <option value="">Choose</option>
            <option value="2-10">2-10</option>
            <option value="11-50">11-50</option>
            <option value="51-200">51-200</option>
            <option value="200+">200+</option>
          </select>
        </label>
      </div>
      <label style={label}>
        What should burnlog help you control?
        <textarea name="useCase" rows={3} style={{ ...input, resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={status === "saving"} style={button}>
          {status === "saving" ? "Saving..." : "Request team access"}
        </button>
        {status === "done" && <span style={ok}>saved</span>}
        {status === "error" && <span style={bad}>{error}</span>}
      </div>
    </form>
  );
}

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#A1A1AA",
  fontSize: 12,
  fontFamily: MONO,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #27272A",
  borderRadius: 7,
  background: "#09090B",
  color: "#FAFAFA",
  padding: "11px 12px",
  font: "inherit",
  outline: "none",
};

const button: React.CSSProperties = {
  border: "none",
  borderRadius: 7,
  background: "#D97706",
  color: "#09090B",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 800,
  padding: "12px 18px",
  cursor: "pointer",
};

const ok: React.CSSProperties = { color: "#10B981", fontFamily: MONO, fontSize: 12 };
const bad: React.CSSProperties = { color: "#F87171", fontFamily: MONO, fontSize: 12 };

"use client";

import { useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Edit the fields your public profile displays.
 *
 * Restored after a consolidation pass deleted the only caller of
 * PATCH /api/me/profile: bio, github, twitter and website were still rendered
 * on /u/[username] but had become unsettable through any UI. It lives in
 * settings rather than back on the board, which is where account management
 * belongs — the original placement was the actual mistake.
 */
export function ProfileEditor({
  initial,
}: {
  initial: { bio: string; github: string; twitter: string; website: string };
}) {
  const [bio, setBio] = useState(initial.bio);
  const [github, setGithub] = useState(initial.github);
  const [twitter, setTwitter] = useState(initial.twitter);
  const [website, setWebsite] = useState(initial.website);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bio, github, twitter, website }),
      });
      setState(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  const fields: [string, string, (v: string) => void, string, number][] = [
    ["bio", bio, setBio, "founder @ …", 160],
    ["github", github, setGithub, "username", 39],
    ["twitter", twitter, setTwitter, "handle, without the @", 15],
    ["website", website, setWebsite, "https://…", 200],
  ];

  return (
    <div style={card}>
      <div style={label}>PUBLIC PROFILE</div>
      <div style={{ display: "grid", gap: 10 }}>
        {fields.map(([name, value, set, placeholder, max]) => (
          <label key={name} style={{ display: "grid", gap: 4 }}>
            <span style={fieldLabel}>{name}</span>
            <input
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              maxLength={max}
              style={input}
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button onClick={save} disabled={state === "saving"} style={saveBtn}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && <span style={{ ...fieldLabel, color: "#10B981" }}>saved</span>}
        {state === "error" && <span style={{ ...fieldLabel, color: "#EF4444" }}>could not save</span>}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#0C0C0E",
  border: "1px solid #18181B",
  borderRadius: 10,
  padding: 20,
};

const label: React.CSSProperties = {
  fontSize: 11,
  color: "#52525B",
  letterSpacing: 1.5,
  textTransform: "uppercase",
  fontFamily: MONO,
  marginBottom: 14,
};

const fieldLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  color: "#52525B",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "9px 12px",
  color: "#FAFAFA",
  fontFamily: MONO,
  fontSize: 12.5,
  outline: "none",
};

const saveBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 6,
  border: "1px solid #D9770655",
  background: "#D9770618",
  color: "#D97706",
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

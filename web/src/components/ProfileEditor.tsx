"use client";

import { useEffect, useRef, useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Edit the fields your public profile displays.
 *
 * Restored after a consolidation pass deleted the only caller of
 * PATCH /api/me/profile: bio, Twitter and website were still rendered
 * on /u/[username] but had become unsettable through any UI. It lives in
 * settings rather than back on the board, which is where account management
 * belongs — the original placement was the actual mistake.
 */
export function ProfileEditor({
  initial,
}: {
  initial: { bio: string; twitter: string; website: string };
}) {
  const [bio, setBio] = useState(initial.bio);
  const [twitter, setTwitter] = useState(initial.twitter);
  const [website, setWebsite] = useState(initial.website);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saved = useRef(JSON.stringify({ bio: initial.bio, twitter: initial.twitter, website: initial.website }));
  const latest = useRef(saved.current);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const draft = JSON.stringify({ bio, twitter, website });
  latest.current = draft;

  async function save(next = { bio, twitter, website }) {
    const payload = JSON.stringify(next);
    setState("saving");
    const request = queue.current.then(async () => {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      if (!res.ok) throw new Error("profile save failed");
      saved.current = payload;
    });
    queue.current = request.catch(() => undefined);

    try {
      await request;
      setState(latest.current === payload ? "saved" : "idle");
    } catch {
      if (latest.current === payload) setState("error");
    }
  }

  useEffect(() => {
    if (draft === saved.current) return;
    setState("idle");
    const next = { bio, twitter, website };
    const id = setTimeout(() => void save(next), 650);
    return () => clearTimeout(id);
    // Save the exact draft captured by this render after typing pauses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const fields: [string, string, (v: string) => void, string, number][] = [
    ["bio", bio, setBio, "founder @ …", 160],
    ["twitter", twitter, setTwitter, "handle, without the @", 15],
    ["website", website, setWebsite, "https://…", 200],
  ];

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ ...label, marginBottom: 0 }}>PUBLIC PROFILE</div>
        <span aria-live="polite" style={{ ...fieldLabel, marginLeft: "auto", color: state === "error" ? "#EF4444" : state === "saved" ? "#10B981" : "#52525B" }}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "error" ? "couldn't save" : "autosaves"}
        </span>
      </div>
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
      {state === "error" && (
        <button onClick={() => void save()} style={saveBtn}>Retry save</button>
      )}
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
  marginTop: 14,
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

"use client";

import { useEffect, useRef, useState } from "react";

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
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[13px] font-medium text-soft">Public profile</h2>
        <span
          aria-live="polite"
          className={`text-[12px] ${state === "error" ? "text-[#F28B82]" : state === "saved" ? "text-soft" : "text-dim"}`}
        >
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "error" ? "couldn't save" : "autosaves"}
        </span>
      </div>
      <div className="grid gap-4">
        {fields.map(([name, value, set, placeholder, max]) => (
          <label key={name} className="block">
            <span className="label capitalize">{name}</span>
            <input
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              maxLength={max}
              className="field"
            />
          </label>
        ))}
      </div>
      {state === "error" && (
        <button onClick={() => void save()} className="btn mt-5">Retry save</button>
      )}
    </div>
  );
}

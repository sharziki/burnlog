"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Edit the fields your public profile displays.
 *
 * Rendered only for the owner, below their public token profile.
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

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[15px] font-medium text-ink">Profile</h2>
        <span
          aria-live="polite"
          className={`text-[12px] ${state === "error" ? "text-[#F28B82]" : state === "saved" ? "text-soft" : "text-dim"}`}
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Couldn't save" : "Saves as you type"}
        </span>
      </div>
      <div className="grid gap-4">
        <label className="block">
          <span className="label flex justify-between">
            <span>Bio</span>
            <span className="font-mono text-faint">{bio.length}/160</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What you build, in a line."
            maxLength={160}
            rows={2}
            className="field"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">X</span>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-dim">@</span>
              <input
                value={twitter}
                onChange={(e) => setTwitter(e.target.value.replace(/^@/, ""))}
                placeholder="handle"
                maxLength={15}
                className="field pl-7"
              />
            </span>
          </label>
          <label className="block">
            <span className="label">Website</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yoursite.com"
              maxLength={200}
              className="field"
            />
          </label>
        </div>
      </div>
      {state === "error" && (
        <button onClick={() => void save()} className="btn mt-5">Retry save</button>
      )}
    </div>
  );
}

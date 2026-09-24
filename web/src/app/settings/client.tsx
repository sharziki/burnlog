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
    <main className="mx-auto max-w-2xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[13px] text-dim">burnlog</p>
          <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.02] text-ink sm:text-[52px]">
            Settings
          </h1>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-10 border-t border-line py-8">
        <a href={`/u/${username}`} className="group flex items-center gap-4">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={44} height={44} className="rounded-[10px]" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-dim">Signed in as</span>
            <span className="mt-1 block truncate text-[15px] font-medium text-ink">{name}</span>
            <span className="block font-mono text-[12px] text-dim">@{username}</span>
          </span>
          <span className="text-[13px] text-soft group-hover:text-ink">view public profile →</span>
        </a>
      </section>

      <section className="border-t border-line py-8">
        <ProfileEditor initial={profile} />
      </section>

      <section className="border-t border-line py-8">
        <h2 className="m-0 text-[13px] font-medium text-soft">CLI API key</h2>
        <p className="m-0 mb-5 mt-2 text-[14px] leading-relaxed text-dim">
          Generate a key, then run <code className="font-mono text-ink">burnlog login &lt;key&gt;</code> on the machine you burn on.
        </p>
        <button onClick={createKey} disabled={loading} className="btn btn-primary">
          {loading ? "generating..." : "generate new key"}
        </button>

        {key && (
          <div className="mt-5">
            <p className="m-0 mb-2 text-[13px] text-dim">Copy this once — it won&apos;t be shown again</p>
            <pre className="m-0 whitespace-pre-wrap break-all rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] text-ink">
              {key}
            </pre>
          </div>
        )}
      </section>

      <section className="border-t border-line py-8">
        <h2 className="m-0 text-[13px] font-medium text-soft">Delete account</h2>
        <p className="m-0 mb-5 mt-2 text-[14px] leading-relaxed text-dim">
          Permanently deletes your user profile, sessions, API keys, personal burn events, and clubs you own. Type{" "}
          <code className="font-mono text-ink">delete my account</code> to confirm.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={deleteConfirm}
            onChange={(e) => {
              setDeleteConfirm(e.target.value);
              setDeleteStatus("idle");
            }}
            aria-label="Type delete my account to confirm"
            className="field min-w-[220px] flex-1 font-mono"
          />
          <button
            onClick={deleteAccount}
            disabled={deleteConfirm !== "delete my account" || deleteStatus === "deleting"}
            className="btn btn-danger"
          >
            {deleteStatus === "deleting" ? "deleting..." : "delete account"}
          </button>
        </div>
        {deleteStatus === "error" && (
          <p className="m-0 mt-3 text-[13px] text-[#F28B82]">
            Delete failed. Check your session and try again.
          </p>
        )}
      </section>
    </main>
  );
}

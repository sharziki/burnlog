"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GroupMembership({ id, joined, owner }: { id: string; joined: boolean; owner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clubs/${id}/${joined ? "leave" : "join"}`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Could not update group");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update group");
    } finally {
      setBusy(false);
    }
  }
  return <div className="flex flex-col items-start gap-2">{owner ? <span className="text-[12px] text-dim">You own this group</span> : <button type="button" onClick={change} disabled={busy} className="cursor-pointer border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-bg disabled:opacity-50">{busy ? "Saving…" : joined ? "Leave group" : "Join group"}</button>}{error && <p role="alert" className="m-0 text-[12px] text-accent">{error}</p>}</div>;
}

export function CreateGroup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/clubs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description"), isPrivate: false }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Could not create group");
      router.push(`/g/${result.club.slug}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create group");
      setBusy(false);
    }
  }
  return <form onSubmit={create} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
    <input name="name" required maxLength={50} placeholder="Group name" aria-label="Group name" className="min-w-0 border border-line bg-transparent px-3 py-2 text-[13px] text-ink" />
    <input name="description" maxLength={180} placeholder="What brings your group together?" aria-label="Group description" className="min-w-0 border border-line bg-transparent px-3 py-2 text-[13px] text-ink" />
    <button disabled={busy} className="cursor-pointer bg-accent px-4 py-2 text-[13px] font-medium text-bg disabled:opacity-50">{busy ? "Creating…" : "Create public group"}</button>
    {error && <p role="alert" className="m-0 text-[12px] text-accent sm:col-span-3">{error}</p>}
  </form>;
}

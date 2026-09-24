"use client";

import { useState, useTransition } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { SetupCTA } from "@/components/SetupCTA";
import { formatTokens } from "@/lib/format";

export type Machine = {
  id: string;
  label: string;
  createdAt: string;
  lastUsed: string | null;
  tokens: number;
};

function ago(iso: string | null): string {
  if (!iso) return "never synced";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `synced ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `synced ${days}d ago`;
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-9">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[15px] font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Settings, in the order people come for them: how you look on the board, the
 * machines that feed it, and the account itself.
 */
export function SettingsClient({
  username,
  name,
  image,
  profile,
  machines,
  signOutAction,
  disconnectAction,
}: {
  username: string;
  name: string;
  image: string | null;
  profile: { bio: string; twitter: string; website: string };
  machines: Machine[];
  signOutAction: () => Promise<void>;
  disconnectAction: (id: string) => Promise<void>;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
      <header className="flex items-center gap-4 pb-9">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={48} height={48} className="size-12 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-display text-[32px] leading-none text-ink">Settings</h1>
          <p className="m-0 mt-2 truncate text-[14px] text-soft">
            {name} <span className="font-mono text-[13px] text-dim">@{username}</span>
          </p>
        </div>
        <a href={`/u/${username}`} className="btn shrink-0">
          View profile
        </a>
      </header>

      <section className="border-t border-line py-9">
        <ProfileEditor initial={profile} />
      </section>

      <Section title="Machines" aside={<span className="text-[12px] text-dim">{machines.length} connected</span>}>
        {machines.length > 0 ? (
          <ul className="m-0 mb-7 list-none border-t border-line p-0">
            {machines.map((m) => (
              <li key={m.id} className="flex items-center gap-4 border-b border-line py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{m.label}</span>
                  <span className="block text-[12px] text-dim">
                    {ago(m.lastUsed)} · <span className="font-mono">{formatTokens(m.tokens)}</span> tokens · added{" "}
                    {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </span>
                {confirming === m.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(() => disconnectAction(m.id).then(() => setConfirming(null)))}
                      className="btn btn-danger h-8 px-3 text-[13px]"
                    >
                      {pending ? "Disconnecting…" : "Disconnect"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="btn h-8 px-3 text-[13px]">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(m.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-dim hover:text-ink">
                    Disconnect
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mb-6 text-[14px] text-soft">No machine connected yet. Connect one and your history lands on the board.</p>
        )}

        <p className="m-0 mb-4 text-[14px] text-soft">
          {machines.length ? "Connect another machine" : "Connect a machine"}: copy the prompt and paste it into your coding
          agent there. Disconnecting keeps the tokens it already synced.
        </p>
        <SetupCTA />

        <details className="group mt-6">
          <summary className="cursor-pointer list-none text-[13px] text-dim hover:text-soft">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Advanced: create an API key by hand
          </summary>
          <div className="mt-4">
            <p className="m-0 mb-4 text-[14px] text-soft">
              For CI or a machine without an agent: create a key, then run{" "}
              <code className="font-mono text-[13px] text-ink">npx @sxnalabs/burnlog login &lt;key&gt;</code> there.
            </p>
            {key ? (
              <>
                <pre className="m-0 overflow-x-auto rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] text-ink">{key}</pre>
                <p className="m-0 mt-2 text-[12px] text-dim">Copy it now — it won&apos;t be shown again.</p>
              </>
            ) : (
              <button type="button" onClick={createKey} disabled={loading} className="btn">
                {loading ? "Creating…" : "Create API key"}
              </button>
            )}
          </div>
        </details>
      </Section>

      <Section title="Account">
        <form action={signOutAction}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>

        <details className="group mt-8">
          <summary className="cursor-pointer list-none text-[13px] text-dim hover:text-[#F28B82]">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Delete account
          </summary>
          <div className="mt-4">
            <p className="m-0 mb-4 text-[14px] text-soft">
              Permanently deletes your profile, sessions, API keys, personal burn events, and clubs you own. Type{" "}
              <code className="font-mono text-[13px] text-[#F28B82]">delete my account</code> to confirm.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="delete my account"
                aria-label="Type delete my account to confirm"
                className="field sm:flex-1"
              />
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleteConfirm !== "delete my account" || deleteStatus === "deleting"}
                className="btn btn-danger"
              >
                {deleteStatus === "deleting" ? "Deleting…" : "Delete account"}
              </button>
            </div>
            {deleteStatus === "error" && <p className="m-0 mt-3 text-[13px] text-[#F28B82]">Couldn&apos;t delete. Try again.</p>}
          </div>
        </details>
      </Section>
    </main>
  );
}

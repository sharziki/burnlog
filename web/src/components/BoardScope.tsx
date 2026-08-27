"use client";

import { useEffect, useRef, useState } from "react";
import { formatTokens } from "@/lib/format";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export type Scope = "world" | "friends";

type Person = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  totalTokens: number;
  status: "none" | "pending_out" | "pending_in" | "friends" | "self";
};

const STATUS_LABEL: Record<Person["status"], string> = {
  none: "Add friend",
  pending_out: "Requested",
  pending_in: "Accept",
  friends: "Friends",
  self: "You",
};

/**
 * Scope switcher + people search for the board.
 *
 * Search lives here rather than on a separate page because finding someone
 * and then seeing where they sit on the board is one thought, not two.
 *
 * Signed out, the friend controls are hidden rather than shown-and-bounced.
 * A visitor with no account has no friends list to switch to and nobody to
 * invite, so every one of those controls used to spend a click sending them
 * to a sign-in screen and back to the same button. Search still works, because
 * looking someone up is a real thing to want before you sign up.
 */
export function BoardScope({
  scope,
  onScope,
  signedIn,
  username,
  onFriendChange,
}: {
  scope: Scope;
  onScope: (s: Scope) => void;
  signedIn: boolean;
  username?: string | null;
  onFriendChange?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const inviter = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (inviter) setQuery(inviter);
  }, []);

  // Debounced so typing a name isn't one request per keystroke.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = (await res.json()) as { ok: boolean; people?: Person[] };
        setResults(data.ok ? (data.people ?? []) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  async function act(person: Person) {
    // The button is not rendered signed out; this is the belt to that braces.
    if (!signedIn) return;
    const action =
      person.status === "none" ? "request" : person.status === "pending_in" ? "accept" : null;
    if (!action) return;

    setBusy(person.id);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: person.username, action }),
      });
      const data = (await res.json()) as { ok: boolean; status?: Person["status"] };
      if (data.ok && data.status) {
        setResults((prev) =>
          prev.map((p) => (p.id === person.id ? { ...p, status: data.status! } : p)),
        );
        onFriendChange?.();
      }
    } catch {
      // Leave the row as-is; the user can retry.
    } finally {
      setBusy(null);
    }
  }

  async function invite() {
    if (!signedIn || !username) return;
    const url = `${window.location.origin}/?ref=${encodeURIComponent(username)}#leaderboard`;
    const text = "I’m on burnlog. Track your AI coding tokens and race me.";
    try {
      if (navigator.share) await navigator.share({ title: "Race me on burnlog", text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      // Cancelling native share is not an error state.
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {signedIn && (
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#0C0C0E",
            borderRadius: 6,
            padding: 2,
            border: "1px solid #18181B",
          }}
        >
          {(["world", "friends"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScope(s)}
              style={{
                padding: "7px 14px",
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                background: scope === s ? "#1C1C1F" : "transparent",
                color: scope === s ? "#D97706" : "#71717A",
              }}
            >
              {s === "world" ? "World" : "Friends"}
            </button>
          ))}
        </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search people…"
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            background: "#09090B",
            border: "1px solid #18181B",
            borderRadius: 6,
            padding: "9px 12px",
            color: "#FAFAFA",
            fontFamily: MONO,
            fontSize: 12,
            outline: "none",
          }}
        />

        {signedIn && (
        <button
          onClick={invite}
          style={{
            minHeight: 40,
            padding: "8px 13px",
            border: "1px solid #D9770644",
            borderRadius: 6,
            background: "#D9770612",
            color: "#D97706",
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {shared ? "Invite copied" : "Invite friends"}
        </button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div
          style={{
            marginTop: 10,
            border: "1px solid #18181B",
            borderRadius: 10,
            background: "#0C0C0E",
            overflow: "hidden",
          }}
        >
          {searching && results.length === 0 && (
            <div style={{ padding: 16, fontFamily: MONO, fontSize: 11, color: "#52525B" }}>
              searching…
            </div>
          )}
          {!searching && results.length === 0 && (
            <div style={{ padding: 16, fontFamily: MONO, fontSize: 11, color: "#52525B" }}>
              nobody matching “{query.trim()}”
            </div>
          )}
          {results.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderBottom: "1px solid #131316",
              }}
            >
              <a href={`/u/${p.username}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none" }}>
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" width={28} height={28} style={{ borderRadius: "50%", border: "1px solid #27272A" }} />
                ) : (
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#18181B",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#71717A",
                    }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "#FAFAFA", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  <span style={{ display: "block", fontFamily: MONO, fontSize: 10, color: "#52525B" }}>
                    @{p.username} · {formatTokens(p.totalTokens)}
                  </span>
                </span>
              </a>
              {signedIn && (
              <button
                onClick={() => act(p)}
                disabled={busy === p.id || p.status === "self" || p.status === "friends" || p.status === "pending_out"}
                style={{
                  padding: "6px 12px",
                  minHeight: 40,
                  borderRadius: 6,
                  fontFamily: MONO,
                  fontSize: 10,
                  cursor:
                    p.status === "none" || p.status === "pending_in" ? "pointer" : "default",
                  border: `1px solid ${p.status === "none" || p.status === "pending_in" ? "#D9770655" : "#27272A"}`,
                  background: p.status === "none" || p.status === "pending_in" ? "#D9770618" : "transparent",
                  color: p.status === "none" || p.status === "pending_in" ? "#D97706" : "#52525B",
                  whiteSpace: "nowrap",
                }}
              >
                {busy === p.id ? "…" : STATUS_LABEL[p.status]}
              </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

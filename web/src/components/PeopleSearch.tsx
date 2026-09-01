"use client";

import { useEffect, useRef, useState } from "react";
import { formatTokens } from "@/lib/format";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type Person = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  totalTokens: number;
};

/**
 * People search for the board, plus the share link.
 *
 * Search lives here rather than on a separate page because finding someone
 * and then seeing where they sit on the board is one thought, not two.
 *
 * There is one board — the world's. An earlier version also carried a
 * friends/world switch and per-row friend requests; both were removed because
 * a private sub-board is the opposite of what a public leaderboard is for, and
 * the request flow was a second social graph to maintain for no ranking value.
 * The share link stays: inviting someone to burn against you never needed
 * either of them.
 */
export function PeopleSearch({
  signedIn,
  username,
}: {
  signedIn: boolean;
  username?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [shared, setShared] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A ?ref= link drops you here with the inviter already looked up.
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
            {shared ? "Link copied" : "Challenge someone"}
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
            <a
              key={p.id}
              href={`/u/${p.username}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderBottom: "1px solid #131316",
                textDecoration: "none",
              }}
            >
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
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", color: "#FAFAFA", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: 10, color: "#52525B" }}>
                  @{p.username} · {formatTokens(p.totalTokens)}
                </span>
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#3F3F46" }}>view →</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type Person = { id: string; username: string | null; name: string | null; image: string | null };
type Request = { id: string; user: Person; createdAt: string };

/**
 * Friend requests and current friends, for the settings page.
 * This is account management, which is why it lives here rather than on the
 * public board.
 */
export function FriendRequests({ me }: { me: string }) {
  const [friends, setFriends] = useState<Person[]>([]);
  const [incoming, setIncoming] = useState<Request[]>([]);
  const [outgoing, setOutgoing] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        friends?: Person[];
        incoming?: Request[];
        outgoing?: Request[];
      };
      if (data.ok) {
        setFriends(data.friends ?? []);
        setIncoming(data.incoming ?? []);
        setOutgoing(data.outgoing ?? []);
      }
    } catch {
      // Leave whatever we last had.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(username: string | null, action: string) {
    if (!username) return;
    setBusy(username);
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const empty = !loading && friends.length === 0 && incoming.length === 0 && outgoing.length === 0;

  return (
    <div style={card}>
      <div style={label}>FRIENDS</div>

      {loading && <div style={muted}>loading…</div>}

      {empty && (
        <div style={muted}>
          No friends yet. Search for people on the{" "}
          <a href="/" style={{ color: "#D97706" }}>
            board
          </a>{" "}
          to add them, then switch the board to Friends.
        </div>
      )}

      {incoming.length > 0 && (
        <>
          <div style={{ ...subLabel, color: "#D97706" }}>
            {incoming.length} pending request{incoming.length === 1 ? "" : "s"}
          </div>
          {incoming.map((r) => (
            <Row key={r.id} person={r.user} busy={busy === r.user.username}>
              <button style={primaryBtn} onClick={() => act(r.user.username, "accept")}>
                Accept
              </button>
              <button style={ghostBtn} onClick={() => act(r.user.username, "decline")}>
                Decline
              </button>
            </Row>
          ))}
        </>
      )}

      {friends.length > 0 && (
        <>
          <div style={subLabel}>{friends.length} friend{friends.length === 1 ? "" : "s"}</div>
          {friends.map((f) => (
            <Row key={f.id} person={f} busy={busy === f.username}>
              {/* /h2h/[matchup] parses a `left-vs-right` slug; a bare username 404s. */}
              <a href={`/h2h/${me}-vs-${f.username}`} style={ghostBtn}>
                H2H
              </a>
              <button style={ghostBtn} onClick={() => act(f.username, "remove")}>
                Remove
              </button>
            </Row>
          ))}
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <div style={subLabel}>sent</div>
          {outgoing.map((r) => (
            <Row key={r.id} person={r.user} busy={busy === r.user.username}>
              <span style={{ ...muted, margin: 0 }}>awaiting reply</span>
              <button style={ghostBtn} onClick={() => act(r.user.username, "decline")}>
                Cancel
              </button>
            </Row>
          ))}
        </>
      )}
    </div>
  );
}

function Row({
  person,
  busy,
  children,
}: {
  person: Person;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid #131316",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <a href={`/u/${person.username}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, minHeight: 40, textDecoration: "none" }}>
        {person.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.image} alt="" width={28} height={28} style={{ borderRadius: "50%", border: "1px solid #27272A" }} />
        ) : (
          // Initials, matching BoardScope and the board rows. `image` only
          // ever comes from GitHub OAuth, so without this every row here was
          // a blank dot for people the board renders with initials.
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
              flexShrink: 0,
            }}
          >
            {(person.name ?? person.username ?? "?").slice(0, 2).toUpperCase()}
          </span>
        )}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", color: "#FAFAFA", fontSize: 13 }}>{person.name}</span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 10, color: "#52525B" }}>
            @{person.username}
          </span>
        </span>
      </a>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
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
  marginBottom: 12,
};

const subLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#3F3F46",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontFamily: MONO,
  margin: "14px 0 4px",
};

const muted: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  color: "#52525B",
  lineHeight: 1.6,
  margin: "6px 0",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  // Accept/Decline are the primary actions on /settings and measured 27px
  // tall — a miss on a phone. Grid centring keeps the label optically placed
  // now that the box is taller than the text.
  minHeight: 40,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 6,
  border: "1px solid #D9770655",
  background: "#D9770618",
  color: "#D97706",
  fontFamily: MONO,
  fontSize: 10,
  cursor: "pointer",
  textDecoration: "none",
};

const ghostBtn: React.CSSProperties = {
  padding: "6px 12px",
  // Accept/Decline are the primary actions on /settings and measured 27px
  // tall — a miss on a phone. Grid centring keeps the label optically placed
  // now that the box is taller than the text.
  minHeight: 40,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 6,
  border: "1px solid #27272A",
  background: "transparent",
  color: "#71717A",
  fontFamily: MONO,
  fontSize: 10,
  cursor: "pointer",
  textDecoration: "none",
};

"use client";

import { useCallback, useEffect, useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type Author = { username: string | null; name: string | null; image: string | null };
type Reply = { id: string; body: string; createdAt: string; author: Author };
type Post = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  author: Author;
  replies: Reply[];
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

/**
 * The club feed — where a club stops being a leaderboard with a name and
 * becomes somewhere people compare MCP setups and skills.
 */
export function ClubFeed({ clubId, isMember }: { clubId: string; isMember: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postTags, setPostTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const load = useCallback(async () => {
    try {
      const url = `/api/clubs/${clubId}/posts${filter ? `?tag=${encodeURIComponent(filter)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; posts?: Post[]; suggestedTags?: string[] };
      if (data.ok) {
        setPosts(data.posts ?? []);
        setTags(data.suggestedTags ?? []);
      }
    } catch {
      // keep whatever's on screen
    } finally {
      setLoading(false);
    }
  }, [clubId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPost() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, tags: postTags.join(",") }),
      });
      if (res.ok) {
        setTitle("");
        setBody("");
        setPostTags([]);
        setComposing(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(postId: string) {
    if (!replyBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, body: replyBody }),
      });
      if (res.ok) {
        setReplyBody("");
        setReplyTo(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <button
          onClick={() => setFilter(null)}
          style={{ ...pill, ...(filter === null ? pillOn : {}) }}
        >
          all
        </button>
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(filter === t ? null : t)}
            style={{ ...pill, ...(filter === t ? pillOn : {}) }}
          >
            #{t}
          </button>
        ))}
        {isMember && (
          <button onClick={() => setComposing((v) => !v)} style={{ ...pill, ...pillPrimary, marginLeft: "auto" }}>
            {composing ? "Cancel" : "New post"}
          </button>
        )}
      </div>

      {composing && (
        <div style={{ ...card, marginBottom: 14 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title (optional)"
            maxLength={120}
            style={input}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="what MCP, skill, or setup are you running?"
            rows={4}
            style={{ ...input, marginTop: 8, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {tags.map((t) => (
              <button
                key={t}
                onClick={() =>
                  setPostTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                }
                style={{ ...pill, ...(postTags.includes(t) ? pillOn : {}) }}
              >
                #{t}
              </button>
            ))}
          </div>
          <button onClick={submitPost} disabled={busy || !body.trim()} style={{ ...pill, ...pillPrimary, marginTop: 12 }}>
            {busy ? "posting…" : "Post"}
          </button>
        </div>
      )}

      {loading && <div style={muted}>loading…</div>}

      {!loading && posts.length === 0 && (
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ ...muted, margin: 0 }}>
            {isMember
              ? "Nothing here yet. Start the conversation — post the MCP setup you're running."
              : "No posts yet."}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {posts.map((p) => (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {p.author.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.author.image} alt="" width={24} height={24} style={{ borderRadius: "50%" }} />
              ) : (
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#18181B" }} />
              )}
              <a href={`/u/${p.author.username}`} style={{ fontFamily: MONO, fontSize: 11, color: "#A1A1AA", textDecoration: "none" }}>
                @{p.author.username}
              </a>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#3F3F46" }}>{ago(p.createdAt)}</span>
              {p.pinned && <span style={{ fontFamily: MONO, fontSize: 9, color: "#D97706" }}>PINNED</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                {p.tags.map((t) => (
                  <span key={t} style={tagChip}>#{t}</span>
                ))}
              </span>
            </div>

            {p.title && (
              <div style={{ color: "#FAFAFA", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
            )}
            <div style={{ color: "#A1A1AA", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{p.body}</div>

            {p.replies.length > 0 && (
              <div style={{ marginTop: 12, borderLeft: "2px solid #18181B", paddingLeft: 12, display: "grid", gap: 10 }}>
                {p.replies.map((r) => (
                  <div key={r.id}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <a href={`/u/${r.author.username}`} style={{ fontFamily: MONO, fontSize: 10, color: "#71717A", textDecoration: "none" }}>
                        @{r.author.username}
                      </a>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: "#3F3F46" }}>{ago(r.createdAt)}</span>
                    </div>
                    <div style={{ color: "#A1A1AA", fontSize: 12.5, lineHeight: 1.6, marginTop: 3, whiteSpace: "pre-wrap" }}>
                      {r.body}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isMember && (
              <div style={{ marginTop: 12 }}>
                {replyTo === p.id ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitReply(p.id);
                      }}
                      placeholder="reply…"
                      autoFocus
                      style={{ ...input, marginTop: 0 }}
                    />
                    <button onClick={() => submitReply(p.id)} disabled={busy} style={{ ...pill, ...pillPrimary }}>
                      Send
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setReplyTo(p.id)} style={{ ...pill, fontSize: 10 }}>
                    Reply
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#0C0C0E",
  border: "1px solid #18181B",
  borderRadius: 10,
  padding: 16,
};

const pill: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 6,
  border: "1px solid #27272A",
  background: "transparent",
  color: "#71717A",
  fontFamily: MONO,
  fontSize: 11,
  cursor: "pointer",
};

const pillOn: React.CSSProperties = {
  background: "#1C1C1F",
  color: "#D97706",
  borderColor: "#D9770644",
};

const pillPrimary: React.CSSProperties = {
  background: "#D9770618",
  color: "#D97706",
  borderColor: "#D9770655",
};

const tagChip: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  color: "#52525B",
  border: "1px solid #1F1F23",
  borderRadius: 4,
  padding: "2px 6px",
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

const muted: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  color: "#52525B",
  margin: "10px 0",
};

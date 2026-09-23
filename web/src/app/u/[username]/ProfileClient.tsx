import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { ACHIEVEMENTS, TIER_COLOR } from "@/lib/achievements";
import { ShareCard } from "@/components/ShareCard";
import type { UserStats } from "@/lib/stats";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

// The challenge trophies stay in the ledger but not on the shelf: there are no
// challenges to win on the site any more.
const SHOWN = ACHIEVEMENTS.filter((a) => a.key !== "duelist" && a.key !== "champion");

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "openclaw",
  "anthropic-api": "Anthropic API",
  "openai-api": "OpenAI API",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// --- Activity Heatmap ---
function ActivityHeatmap({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(...heatmap, 1);
  const cells = heatmap.map((v, idx) => {
    const week = Math.floor(idx / 7);
    const day = idx % 7;
    const intensity = v / max;
    let background = "#0F0F11";
    if (intensity > 0) background = "rgba(217,119,6,0.12)";
    if (intensity > 0.15) background = "rgba(217,119,6,0.28)";
    if (intensity > 0.35) background = "rgba(217,119,6,0.45)";
    if (intensity > 0.6) background = "rgba(217,119,6,0.7)";
    if (intensity > 0.85) background = "rgba(217,119,6,1)";
    return (
      <div
        key={idx}
        title={`${formatTokens(v)} tokens`}
        style={{
          gridColumn: week + 1,
          gridRow: day + 1,
          background,
          border: "1px solid #09090B",
          borderRadius: 4,
          transition: "background 0.2s ease",
        }}
      />
    );
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 18px)", gridTemplateRows: "repeat(7, 18px)", gap: 4 }}>
      {cells}
    </div>
  );
}

/** "a", "a and b", "a, b and c" — a list that reads as prose. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** 1st, 2nd, 3rd, 11th — the teens are the exception every naive version gets wrong. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function ProfileClient({
  user,
  joinedAt,
  achievements,
  viewer,
  place = null,
  neighbours = [],
}: {
  user: UserStats;
  joinedAt: string;
  achievements: string[];
  /** Signed-in viewer's username; the owner gets the README badge. Null when logged out. */
  viewer: string | null;
  /** Position on the global board, 1-indexed. Null if they aren't on it. */
  place?: number | null;
  /** The burners immediately above and below, for context and for crawl paths. */
  neighbours?: { place: number; username: string; name: string; image: string | null; totalTokens: number }[];
}) {
  const unlockedKeys = new Set(achievements);
  const rank = getRank(user.totalTokens);
  const nextRank = RANKS.find((r) => r.min > user.totalTokens) ?? null;
  const toNext = nextRank ? nextRank.min - user.totalTokens : 0;
  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div style={{ fontFamily: SANS, background: "#09090B", color: "#E4E4E7", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Noise texture */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.03,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Glow */}
      <div
        style={{
          position: "fixed",
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(217,119,6,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px", position: "relative", zIndex: 1 }}>
        {/* ─── Header ─── */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 40 }}>
          {/* Avatar */}
          {user.image ? (
            <img
              src={user.image}
              alt={user.username}
              width={88}
              height={88}
              style={{ borderRadius: 16, border: `3px solid ${rank.color}44`, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 16,
                background: `${rank.color}22`,
                border: `3px solid ${rank.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color: rank.color,
                fontFamily: MONO,
                flexShrink: 0,
              }}
            >
              {user.avatar}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FAFAFA", margin: 0, fontFamily: SANS }}>{user.name}</h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: `${rank.color}18`,
                  border: `1px solid ${rank.color}33`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: rank.color,
                  fontFamily: MONO,
                }}
              >
                {rank.icon} {rank.name}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#52525B", fontFamily: MONO, marginTop: 4 }}>@{user.username}</div>

            {user.bio && (
              <p style={{ fontSize: 14, color: "#A1A1AA", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>{user.bio}</p>
            )}

            {/* Social links + meta */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              {user.github && (
                <a
                  href={`https://github.com/${user.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                  {user.github}
                </a>
              )}
              {user.twitter && (
                <a
                  href={`https://x.com/${user.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @{user.twitter}
                </a>
              )}
              {user.website && (
                <a
                  href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#71717A", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontFamily: MONO }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {user.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>joined {joinDate}</span>
              <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>active {relativeTime(user.lastActive)}</span>
            </div>
          </div>
        </div>

        <ShareCard username={user.username} tokens={formatTokens(user.totalTokens)} place={place} own={viewer === user.username} />

        {/* ─── Summary line ───
            Every number above this is a chart or a tile, which a search engine
            reads as an empty page. This is the same data as a sentence: unique
            per burner, and the only prose the page has. */}
        <p style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.75, color: "#A1A1AA", margin: "0 0 24px", maxWidth: 760 }}>
          <strong style={{ color: "#E4E4E7", fontWeight: 600 }}>@{user.username}</strong> has burned{" "}
          <strong style={{ color: "#E4E4E7", fontWeight: 600 }}>{formatTokens(user.totalTokens)} tokens</strong>{" "}
          across {user.commits.toLocaleString()} session{user.commits === 1 ? "" : "s"} of AI coding
          {user.sources.length > 0 && (
            // Top three by tokens, joined like a person would write it. The full
            // breakdown is the SOURCES card below; this is a sentence, not a list.
            <> with {joinNames(user.sources.slice(0, 3).map((x) => SOURCE_LABELS[x.source] ?? x.source))}</>
          )}
          , which is rank <strong style={{ color: rank.color, fontWeight: 600 }}>{rank.name}</strong> on burnlog
          {place ? <> and {ordinal(place)} on the global board</> : null}.
          {user.streak > 0 && <> They&apos;re on a {user.streak}-day streak</>}
          {user.streak > 0 && user.longestStreak > user.streak && <>, {user.longestStreak} days at their best</>}
          {user.streak > 0 && "."}
          {nextRank && (
            <> {formatTokens(toNext)} more tokens reaches {nextRank.name}.</>
          )}{" "}
          Tokens only — burnlog never sees prompts, code, or file names.
        </p>

        {/* ─── Heatmap ─── */}
        <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
            12-WEEK ACTIVITY
          </div>
          <ActivityHeatmap heatmap={user.heatmap} />
          <div style={{ display: "flex", gap: 4, marginTop: 10, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginRight: 4 }}>Less</span>
            {[0, 0.12, 0.28, 0.45, 0.7, 1].map((opacity, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: opacity === 0 ? "#0F0F11" : `rgba(217,119,6,${opacity})`,
                  border: "1px solid #09090B",
                }}
              />
            ))}
            <span style={{ fontSize: 10, color: "#3F3F46", fontFamily: MONO, marginLeft: 4 }}>More</span>
          </div>
        </div>

        {/* ─── Sources + Top Models ─── */}
        <div className="profile-pair" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginBottom: 24 }}>
          {/* Sources */}
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              SOURCES
            </div>
            {user.sources.length === 0 ? (
              <div style={{ fontSize: 12, color: "#3F3F46", fontFamily: MONO }}>No data yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {user.sources.map((s) => {
                  const total = user.sources.reduce((sum, x) => sum + x.tokens, 0) || 1;
                  const pct = Math.round((s.tokens / total) * 100);
                  return (
                    <div key={s.source} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO }}>
                      <span style={{ fontSize: 12, color: "#D97706", fontWeight: 700, minWidth: 100 }}>
                        {SOURCE_LABELS[s.source] ?? s.source}
                      </span>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#18181B", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#D97706", borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#52525B", minWidth: 60, textAlign: "right" }}>{formatTokens(s.tokens)}</span>
                      <span style={{ fontSize: 10, color: "#3F3F46", minWidth: 30, textAlign: "right" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Models */}
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              TOP MODELS
            </div>
            {user.topModels.length === 0 ? (
              <div style={{ fontSize: 12, color: "#3F3F46", fontFamily: MONO }}>No data yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {user.topModels.map((m, i) => {
                  const total = user.topModels.reduce((sum, x) => sum + x.tokens, 0) || 1;
                  const pct = Math.round((m.tokens / total) * 100);
                  return (
                    <div key={m.model} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO }}>
                      <span style={{ fontSize: 12, color: i === 0 ? "#D97706" : "#52525B", fontWeight: 600, width: 18, textAlign: "center" }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: "#E4E4E7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.model}
                      </span>
                      <span style={{ fontSize: 11, color: "#52525B" }}>{formatTokens(m.tokens)}</span>
                      <span style={{ fontSize: 10, color: "#3F3F46", minWidth: 30, textAlign: "right" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Nearby on the board ───
            Links out to the burners either side. Cheap for a reader, and the
            only path a crawler has from one profile to another. */}
        {neighbours.length > 0 && (
          <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, fontFamily: MONO }}>
              NEARBY ON THE BOARD
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {neighbours.map((n) => (
                <a
                  key={n.username}
                  href={`/u/${n.username}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid #18181B",
                    borderRadius: 8,
                    padding: "8px 12px",
                    textDecoration: "none",
                    background: "#09090B",
                    fontFamily: MONO,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#52525B" }}>#{n.place}</span>
                  {n.image && (
                    <img src={n.image} alt="" width={18} height={18} style={{ borderRadius: "50%" }} />
                  )}
                  <span style={{ color: "#E4E4E7" }}>@{n.username}</span>
                  <span style={{ color: "#52525B" }}>{formatTokens(n.totalTokens)}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ─── Trophy case ─── */}
        <div style={{ marginTop: 20, background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: "#52525B", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: MONO }}>
              ACHIEVEMENTS
            </span>
            <span style={{ fontSize: 11, color: "#3F3F46", fontFamily: MONO }}>
              {SHOWN.filter((a) => unlockedKeys.has(a.key)).length} / {SHOWN.length}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 8 }}>
            {SHOWN.map((a) => {
              const earned = unlockedKeys.has(a.key);
              const color = TIER_COLOR[a.tier];
              return (
                <div
                  key={a.key}
                  title={earned ? a.name : `Locked — ${a.how}`}
                  style={{
                    border: `1px solid ${earned ? color + "44" : "#18181B"}`,
                    background: earned ? color + "0D" : "transparent",
                    borderRadius: 8,
                    padding: "10px 12px",
                    opacity: earned ? 1 : 0.62,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: earned ? color : "#3F3F46", fontSize: 15, fontFamily: MONO }}>{a.icon}</span>
                    <span style={{ fontSize: 12, color: earned ? "#FAFAFA" : "#52525B", fontWeight: 600 }}>{a.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO, marginTop: 5, lineHeight: 1.4 }}>
                    {earned ? a.tier : a.how}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

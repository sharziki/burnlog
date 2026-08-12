"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatRemaining,
  formatScore,
  type ChallengeView,
  type Standing,
} from "@/lib/challenges";
import { formatTokens } from "@/lib/format";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

const PLACE_COLOR = ["#D97706", "#A1A1AA", "#92400E"];

/** Live standings refresh. Slow enough to be free, fast enough to feel live. */
const POLL_MS = 20_000;

export function ChallengeClient({
  initial,
  signedIn,
  joined: initialJoined,
  meUserId,
  siteUrl,
}: {
  initial: ChallengeView;
  signedIn: boolean;
  joined: boolean;
  meUserId: string | null;
  /** Absolute origin, resolved on the server so the share href is stable. */
  siteUrl: string;
}) {
  const [challenge, setChallenge] = useState(initial);
  const [joined, setJoined] = useState(initialJoined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // `null` until mounted: the server and the browser never agree on the
  // current millisecond, so the first client render has to reproduce the
  // server's markup exactly. We use the serialized `msRemaining` for that,
  // then take over with a live clock once hydration is done.
  const [now, setNow] = useState<number | null>(null);

  // Countdown ticks locally so the clock never looks frozen between polls.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/challenges/${challenge.inviteCode}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; challenge?: ChallengeView; joined?: boolean };
      if (data.ok && data.challenge) {
        setChallenge(data.challenge);
        setJoined(Boolean(data.joined));
      }
    } catch {
      // A failed poll is not worth surfacing — the next one will land.
    }
  }, [challenge.inviteCode]);

  useEffect(() => {
    if (challenge.status === "ended") return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, challenge.status]);

  const shareUrl = useMemo(
    () => `${siteUrl.replace(/\/$/, "")}/c/${challenge.inviteCode}`,
    [siteUrl, challenge.inviteCode],
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  async function toggleJoin() {
    if (!signedIn) {
      window.location.href = `/api/auth/signin?callbackUrl=/c/${challenge.inviteCode}`;
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${challenge.inviteCode}/join`, {
        method: joined ? "DELETE" : "POST",
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) {
        setError(data.message ?? "Something went wrong.");
      } else {
        await refresh();
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: challenge.name.replace(/ \(rematch( \d+)?\)$/, "") + " (rematch)",
          type: challenge.type,
          days: Math.max(
            3,
            Math.round(
              (Date.parse(challenge.endsAt) - Date.parse(challenge.startsAt)) / 86_400_000,
            ),
          ),
          rematchOfId: challenge.id,
          ...challenge.config,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        challenge?: { url: string };
      };
      if (data.ok && data.challenge) window.location.href = data.challenge.url;
      else setError(data.message ?? "Couldn't create the rematch.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const remainingMs =
    challenge.status === "ended"
      ? 0
      : now === null
        ? challenge.msRemaining
        : Date.parse(challenge.endsAt) - now;
  const totalMs = Date.parse(challenge.endsAt) - Date.parse(challenge.startsAt);
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / totalMs)) : 1;

  const me = meUserId ? challenge.standings.find((s) => s.userId === meUserId) : undefined;
  const pot = challenge.standings.reduce((s, r) => s + r.tokens, 0);

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "44px 24px 80px",
        color: "#E4E4E7",
        fontFamily: SANS,
      }}
    >
      {/* ---------- Header ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#52525B" }}>
          Challenge
        </span>
        <span style={{ color: "#27272A" }}>/</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#D97706" }}>
          {challenge.icon} {challenge.typeLabel}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: challenge.status === "ended" ? "#52525B" : "#10B981",
          }}
        >
          {challenge.status === "ended" ? "settled" : "live"}
        </span>
      </div>

      <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.05, color: "#FAFAFA" }}>{challenge.name}</h1>
      <p style={{ margin: "12px 0 0", color: "#71717A", fontSize: 14 }}>
        Hosted by{" "}
        <a href={`/u/${challenge.hostUsername}`} style={{ color: "#A1A1AA" }}>
          @{challenge.hostUsername}
        </a>
        {" · "}
        {challenge.standings.length} burning
        {challenge.type === "provider" && challenge.config.provider ? ` · ${challenge.config.provider} only` : ""}
        {challenge.type === "streak" && challenge.config.targetStreak ? ` · first to ${challenge.config.targetStreak} days` : ""}
        {challenge.type === "cost-cap" && challenge.config.budgetTokens
          ? ` · ${formatTokens(challenge.config.budgetTokens)} budget`
          : ""}
      </p>

      {/* ---------- Clock ---------- */}
      <div
        style={{
          marginTop: 24,
          border: "1px solid #18181B",
          borderRadius: 12,
          background: "#0C0C0E",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 30,
              fontWeight: 700,
              color: challenge.status === "ended" ? "#52525B" : "#FAFAFA",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {challenge.status === "ended" ? "FINAL" : countdown(remainingMs)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#52525B", textTransform: "uppercase", letterSpacing: 1 }}>
            {challenge.status === "ended"
              ? challenge.winnerUsername
                ? `Winner @${challenge.winnerUsername}`
                : "No qualifying entrant"
              : formatRemaining(remainingMs)}
          </div>
        </div>
        <div style={{ height: 4, background: "#18181B", borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: challenge.status === "ended" ? "#3F3F46" : "#D97706",
              transition: "width 1s linear",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: MONO, fontSize: 10, color: "#3F3F46" }}>
          <span>{utcDate(challenge.startsAt)}</span>
          <span>{formatTokens(pot)} burned in this challenge</span>
          <span>{utcDate(challenge.endsAt)}</span>
        </div>
      </div>

      {/* ---------- Actions ---------- */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {challenge.status !== "ended" && (
          <button onClick={toggleJoin} disabled={busy} style={joined ? outlineBtn : primaryBtn}>
            {!signedIn ? "Sign in to join" : joined ? "Leave challenge" : "Join challenge"}
          </button>
        )}
        {challenge.status === "ended" && signedIn && (
          <button onClick={rematch} disabled={busy} style={primaryBtn}>
            Rematch
          </button>
        )}
        <button onClick={copyLink} style={outlineBtn}>
          {copied ? "Link copied" : "Copy invite link"}
        </button>
        <a
          href={`https://twitter.com/intent/tweet?${new URLSearchParams({
            text: `${challenge.name} — ${challenge.typeLabel} on burnlog. Think you burn harder?`,
            url: shareUrl,
          })}`}
          target="_blank"
          rel="noreferrer"
          style={outlineBtn}
        >
          Share
        </a>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>
      )}

      {/* ---------- Your line ---------- */}
      {me && (
        <div
          style={{
            marginTop: 20,
            border: "1px solid #D9770633",
            background: "#D9770610",
            borderRadius: 10,
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#D97706", textTransform: "uppercase", letterSpacing: 1 }}>
            You · {ordinal(me.place)} of {challenge.standings.length}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 13, color: "#E4E4E7" }}>
            {me.qualified
              ? `${formatScore(challenge.type, me.score)} ${challenge.unit}`
              : me.note}
          </span>
        </div>
      )}

      {/* ---------- Standings ---------- */}
      <h2 style={sectionLabel}>Standings</h2>
      <div style={{ border: "1px solid #18181B", borderRadius: 12, overflow: "hidden" }}>
        <div className="standings-grid" style={{ ...rowGrid, padding: "10px 16px", background: "#0C0C0E", borderBottom: "1px solid #18181B" }}>
          <span style={headCell}>#</span>
          <span style={headCell}>Burner</span>
          <span style={{ ...headCell, textAlign: "right" }}>Tokens</span>
          {/* A sprint scores in tokens, so printing `unit` here gave two
              columns both headed TOKENS — one raw, one the score. Name the
              column by what it holds when the unit can't tell them apart. */}
          <span style={{ ...headCell, textAlign: "right" }}>
            {challenge.unit === "tokens" ? "Score" : challenge.unit}
          </span>
        </div>
        {challenge.standings.map((s) => (
          <StandingRow
            key={s.userId}
            standing={s}
            type={challenge.type}
            isMe={s.userId === meUserId}
            ended={challenge.status === "ended"}
          />
        ))}
        {challenge.standings.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
            Nobody has joined yet. Share the link.
          </div>
        )}
      </div>

      <p style={{ marginTop: 18, color: "#3F3F46", fontFamily: MONO, fontSize: 11, lineHeight: 1.7 }}>
        Standings refresh every 20s. Only tokens burned inside the window count.
      </p>
    </main>
  );
}

function StandingRow({
  standing,
  type,
  isMe,
  ended,
}: {
  standing: Standing;
  type: ChallengeView["type"];
  isMe: boolean;
  ended: boolean;
}) {
  const medal = standing.qualified && standing.place <= 3 ? PLACE_COLOR[standing.place - 1] : "#3F3F46";
  return (
    <a
      href={`/u/${standing.username}`}
      className="standings-grid"
      style={{
        ...rowGrid,
        padding: "14px 16px",
        borderBottom: "1px solid #131316",
        background: isMe ? "#D9770610" : "transparent",
        alignItems: "center",
        textDecoration: "none",
        opacity: standing.qualified ? 1 : 0.55,
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: medal }}>
        {ended && standing.place === 1 && standing.qualified ? "★" : standing.place}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {standing.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={standing.image}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: "50%", border: "1px solid #27272A" }}
          />
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
              fontSize: 11,
              color: "#71717A",
            }}
          >
            {standing.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", color: "#FAFAFA", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {standing.name}
          </span>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 10, color: standing.note ? "#D97706" : "#52525B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {standing.note ?? `@${standing.username}`}
          </span>
        </span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: "#71717A", textAlign: "right" }}>
        {formatTokens(standing.tokens)}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 14,
          fontWeight: 700,
          color: standing.qualified ? "#FAFAFA" : "#52525B",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {standing.qualified ? formatScore(type, standing.score) : "—"}
      </span>
    </a>
  );
}

/**
 * Fixed UTC date, not `toLocaleDateString`. The server's timezone and the
 * viewer's rarely match, and a mismatch here breaks hydration. Challenge
 * windows are UTC anyway, so showing UTC is also the honest answer.
 */
function utcDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function countdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0 ? `${days}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px minmax(0, 1fr) 90px 110px",
  gap: 12,
};

const headCell: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#3F3F46",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#52525B",
  margin: "32px 0 12px",
};

const primaryBtn: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: 7,
  background: "#D97706",
  color: "#09090B",
  border: "none",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const outlineBtn: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: 7,
  background: "transparent",
  color: "#A1A1AA",
  border: "1px solid #27272A",
  fontFamily: MONO,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

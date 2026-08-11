"use client";

import { useState } from "react";
import {
  formatRemaining,
  formatScore,
  type ChallengeType,
  type ChallengeTypeId,
  type ChallengeView,
} from "@/lib/challenges";
import { formatTokens } from "@/lib/format";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

const PROVIDERS = ["anthropic", "openai", "google", "other"];

export function ChallengesClient({
  mine,
  open,
  types,
  signedIn,
}: {
  mine: ChallengeView[];
  open: ChallengeView[];
  types: ChallengeType[];
  signedIn: boolean;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "44px 24px 80px",
        color: "#E4E4E7",
        fontFamily: SANS,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#D97706" }}>
        Challenges
      </div>
      <h1 style={{ margin: "10px 0 0", fontSize: 40, lineHeight: 1.05, color: "#FAFAFA" }}>
        Talk is cheap. Tokens aren&apos;t.
      </h1>
      <p style={{ margin: "14px 0 0", color: "#A1A1AA", fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>
        Pick a format, share one link, and settle it with real numbers. Standings pull straight
        from your synced burn — nothing to log by hand.
      </p>

      <div style={{ marginTop: 24 }}>
        {signedIn ? (
          <button onClick={() => setCreating((v) => !v)} style={primaryBtn}>
            {creating ? "Cancel" : "New challenge"}
          </button>
        ) : (
          <a href="/api/auth/signin?callbackUrl=/challenges" style={primaryBtn}>
            Sign in to start one
          </a>
        )}
      </div>

      {creating && <CreateForm types={types} />}

      {mine.length > 0 && (
        <Section title="Your challenges">
          {mine.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </Section>
      )}

      <Section title={mine.length > 0 ? "Open to join" : "Live challenges"}>
        {open.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
            No open challenges right now. Start the first one.
          </div>
        ) : (
          open.map((c) => <ChallengeCard key={c.id} challenge={c} />)
        )}
      </Section>

      <Section title="Formats">
        {types.map((t) => (
          <div key={t.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#D97706", fontFamily: MONO, fontSize: 16 }}>{t.icon}</span>
              <span style={{ color: "#FAFAFA", fontSize: 15, fontWeight: 600 }}>{t.label}</span>
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "#3F3F46" }}>
                {t.durations.join(" / ")}d
              </span>
            </div>
            <p style={{ margin: "8px 0 0", color: "#71717A", fontSize: 13, lineHeight: 1.55 }}>{t.blurb}</p>
          </div>
        ))}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#52525B",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </section>
  );
}

function ChallengeCard({ challenge }: { challenge: ChallengeView }) {
  const leader = challenge.standings.find((s) => s.qualified) ?? challenge.standings[0];
  const ended = challenge.status === "ended";
  return (
    <a href={`/c/${challenge.inviteCode}`} style={{ ...card, display: "block", textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "#D97706", fontFamily: MONO, fontSize: 14 }}>{challenge.icon}</span>
        <span style={{ color: "#FAFAFA", fontSize: 16, fontWeight: 600 }}>{challenge.name}</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "#71717A",
            border: "1px solid #27272A",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {challenge.typeLabel}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: ended ? "#52525B" : "#10B981",
          }}
        >
          {ended ? "settled" : formatRemaining(challenge.msRemaining)}
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          fontFamily: MONO,
          fontSize: 11,
          color: "#52525B",
        }}
      >
        <span>{challenge.standings.length} burning</span>
        <span>{formatTokens(challenge.standings.reduce((s, r) => s + r.tokens, 0))} in the pot</span>
        {leader && (
          <span style={{ color: "#A1A1AA" }}>
            {ended && challenge.winnerUsername
              ? `★ @${challenge.winnerUsername}`
              : `leader @${leader.username}`}
            {leader.qualified ? ` · ${formatScore(challenge.type, leader.score)} ${challenge.unit}` : ""}
          </span>
        )}
      </div>
    </a>
  );
}

function CreateForm({ types }: { types: ChallengeType[] }) {
  const [type, setType] = useState<ChallengeTypeId>(types[0].id);
  const [name, setName] = useState("");
  const [days, setDays] = useState(types[0].durations[0]);
  const [provider, setProvider] = useState("anthropic");
  const [targetStreak, setTargetStreak] = useState(7);
  const [budgetTokens, setBudgetTokens] = useState(1_000_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = types.find((t) => t.id === type) ?? types[0];

  function pickType(next: ChallengeTypeId) {
    setType(next);
    const t = types.find((x) => x.id === next);
    if (t && !t.durations.includes(days)) setDays(t.durations[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${selected.label} · ${days}d`,
          type,
          days,
          provider,
          targetStreak,
          budgetTokens,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        challenge?: { url: string };
      };
      if (data.ok && data.challenge) window.location.href = data.challenge.url;
      else setError(data.message ?? "Couldn't create the challenge.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...card, marginTop: 16, display: "grid", gap: 18 }}>
      <div>
        <label style={fieldLabel}>Format</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickType(t.id)}
              style={{
                ...pill,
                background: t.id === type ? "#1C1C1F" : "transparent",
                color: t.id === type ? "#D97706" : "#71717A",
                borderColor: t.id === type ? "#D9770644" : "#27272A",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <p style={{ margin: "10px 0 0", color: "#52525B", fontSize: 12, fontFamily: MONO }}>{selected.blurb}</p>
      </div>

      <div>
        <label style={fieldLabel}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${selected.label} · ${days}d`}
          maxLength={60}
          style={input}
        />
      </div>

      <div>
        <label style={fieldLabel}>Duration</label>
        <div style={{ display: "flex", gap: 8 }}>
          {selected.durations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              style={{
                ...pill,
                background: d === days ? "#1C1C1F" : "transparent",
                color: d === days ? "#D97706" : "#71717A",
                borderColor: d === days ? "#D9770644" : "#27272A",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {type === "provider" && (
        <div>
          <label style={fieldLabel}>Locked provider</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                style={{
                  ...pill,
                  background: p === provider ? "#1C1C1F" : "transparent",
                  color: p === provider ? "#D97706" : "#71717A",
                  borderColor: p === provider ? "#D9770644" : "#27272A",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === "streak" && (
        <div>
          <label style={fieldLabel}>Target streak (days)</label>
          <input
            type="number"
            min={2}
            max={365}
            value={targetStreak}
            onChange={(e) => setTargetStreak(Number(e.target.value))}
            style={{ ...input, maxWidth: 140 }}
          />
        </div>
      )}

      {type === "cost-cap" && (
        <div>
          <label style={fieldLabel}>Token budget</label>
          <input
            type="number"
            min={1000}
            step={100_000}
            value={budgetTokens}
            onChange={(e) => setBudgetTokens(Number(e.target.value))}
            style={{ ...input, maxWidth: 200 }}
          />
          <p style={{ margin: "8px 0 0", color: "#52525B", fontFamily: MONO, fontSize: 11 }}>
            {formatTokens(budgetTokens)} ceiling — go over and you&apos;re out.
          </p>
        </div>
      )}

      {error && <div style={{ color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>}

      <button type="submit" disabled={busy} style={{ ...primaryBtn, justifySelf: "start" }}>
        {busy ? "Creating…" : "Create & get invite link"}
      </button>
    </form>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #18181B",
  borderRadius: 12,
  background: "#0C0C0E",
  padding: 18,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#52525B",
  marginBottom: 10,
};

const pill: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #27272A",
  fontFamily: MONO,
  fontSize: 11,
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "11px 13px",
  color: "#FAFAFA",
  fontFamily: MONO,
  fontSize: 13,
  outline: "none",
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

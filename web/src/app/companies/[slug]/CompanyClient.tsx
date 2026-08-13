"use client";

import { useState } from "react";
import { formatTokens } from "@/lib/format";
import type { CompanyBillingView } from "@/lib/billing";
import type { ClubPlan } from "@/lib/clubPlan";
import {
  MONO,
  SANS,
  card,
  eyebrow,
  fieldLabel,
  ghostBtn,
  input,
  primaryBtn,
  sectionTitle,
  statusChrome,
} from "../ui";

type Team = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  contributors: number;
  windowTokens: number;
  totalTokens: number;
};

type Company = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: ClubPlan;
  teamLimit: number;
  canManage: boolean;
  billing: CompanyBillingView;
};

type H2HMetricRow = {
  label: string;
  hint: string;
  leftDisplay: string;
  rightDisplay: string;
  unscored: boolean;
  outcome: "left" | "right" | "tie";
};

type H2HResult = {
  left: { name: string };
  right: { name: string };
  metrics: H2HMetricRow[];
  verdict: { left: number; right: number; winner: "left" | "right" | "draw"; summary: string };
};

export function CompanyClient({
  company,
  teams,
  checkout,
}: {
  company: Company;
  teams: Team[];
  /** Where Stripe dropped the user back, if they came from checkout. */
  checkout: "success" | "cancelled" | null;
}) {
  const chrome = statusChrome(company.billing);
  const rollup = teams.reduce(
    (acc, t) => ({
      window: acc.window + t.windowTokens,
      total: acc.total + t.totalTokens,
      members: acc.members + t.memberCount,
    }),
    { window: 0, total: 0, members: 0 },
  );

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
      <a href="/companies" style={{ ...eyebrow, color: "#52525B", textDecoration: "none" }}>
        ← Companies
      </a>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1, color: "#FAFAFA" }}>
          {company.name}
        </h1>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: chrome.color,
          }}
        >
          {chrome.label}
        </span>
      </div>

      {company.description && (
        <p style={{ margin: "12px 0 0", color: "#A1A1AA", fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>
          {company.description}
        </p>
      )}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          fontFamily: MONO,
          fontSize: 11,
          color: "#52525B",
        }}
      >
        <span>
          {teams.length}/{company.teamLimit} clubs
        </span>
        <span>{rollup.members} members</span>
        <span style={{ color: "#A1A1AA" }}>{formatTokens(rollup.window)} · 30d</span>
        <span>{formatTokens(rollup.total)} all-time</span>
      </div>

      {checkout && <CheckoutNotice outcome={checkout} />}
      <BillingPanel company={company} />

      <Teams company={company} teams={teams} />
      <Compare company={company} teams={teams} />
    </main>
  );
}

/**
 * The subscription only turns on when Stripe's webhook says so, which can land
 * a beat after the redirect. Saying that is better than showing a company that
 * still reads "no subscription" seconds after a successful payment.
 */
function CheckoutNotice({ outcome }: { outcome: "success" | "cancelled" }) {
  const success = outcome === "success";
  return (
    <div
      style={{
        ...card,
        marginTop: 20,
        borderColor: success ? "#10B98144" : "#27272A",
        background: success ? "#0A0F0C" : "#0C0C0E",
      }}
    >
      <p style={{ margin: 0, color: "#A1A1AA", fontSize: 13, lineHeight: 1.6 }}>
        {success
          ? "Payment went through. Stripe confirms the subscription over its webhook — reload in a moment if this page still says otherwise."
          : "Checkout cancelled. Nothing was charged."}
      </p>
    </div>
  );
}

function BillingPanel({ company }: { company: Company }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { billing } = company;

  async function go(url: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = (await res.json()) as { ok: boolean; url?: string; message?: string };
      if (data.ok && data.url) window.location.href = data.url;
      else setError(data.message ?? "Stripe didn't return a url.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!billing.configured) {
    return (
      <div style={{ ...card, marginTop: 20, borderColor: "#D9770644", background: "#0F0D0A" }}>
        <div style={eyebrow}>Billing is off</div>
        <p style={{ margin: "10px 0 0", color: "#A1A1AA", fontSize: 13, lineHeight: 1.6 }}>
          This deployment has no Stripe keys, so nothing is being charged and every Company
          feature is open. Set{" "}
          <code style={{ fontFamily: MONO, color: "#D97706" }}>STRIPE_SECRET_KEY</code> and{" "}
          <code style={{ fontFamily: MONO, color: "#D97706" }}>STRIPE_PRICE_ID</code> to sell it.
        </p>
      </div>
    );
  }

  // Members see the state; only the owner gets the buttons that spend money.
  const canAct = company.canManage;

  return (
    <div
      style={{
        ...card,
        marginTop: 20,
        borderColor: billing.writable ? "#18181B" : "#D9770644",
        background: billing.writable ? "#0C0C0E" : "#0F0D0A",
        display: "grid",
        gap: 14,
      }}
    >
      <div>
        <div style={eyebrow}>{billing.writable ? "Subscription" : "Read-only"}</div>
        <p style={{ margin: "10px 0 0", color: "#A1A1AA", fontSize: 13, lineHeight: 1.6 }}>
          {billing.writable
            ? `The Company tier is $${billing.monthlyPriceUsd} a month for up to ${company.teamLimit} clubs.`
            : "Without an active subscription this company is read-only: its clubs and numbers stay exactly where they are, but no new club can be attached."}
          {billing.currentPeriodEnd && billing.paid && (
            <>
              {" "}
              Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}.
            </>
          )}
        </p>
      </div>

      {canAct && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {billing.paid ? (
            <button
              onClick={() => go(`/api/billing/portal?company=${company.id}`)}
              disabled={busy}
              style={ghostBtn}
            >
              {busy ? "Opening…" : "Manage billing"}
            </button>
          ) : (
            <button
              onClick={() =>
                go("/api/billing/checkout", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ company: company.id }),
                })
              }
              disabled={busy}
              style={primaryBtn}
            >
              {busy ? "Opening…" : `Subscribe — $${billing.monthlyPriceUsd}/mo`}
            </button>
          )}
        </div>
      )}

      {error && <div style={{ color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function Teams({ company, teams }: { company: Company; teams: Team[] }) {
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/teams`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: ref.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) window.location.reload();
      else setError(data.message ?? "Couldn't attach that club.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const full = teams.length >= company.teamLimit;

  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={sectionTitle}>Clubs</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {teams.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "#52525B", fontFamily: MONO, fontSize: 12 }}>
            No clubs yet. Attach a club you already own.
          </div>
        ) : (
          // Not links: a club has no page of its own — it's a scope on the
          // board — so anything clickable here would go somewhere wrong.
          teams.map((t) => (
            <div key={t.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: "#FAFAFA", fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, color: "#D97706", fontWeight: 700 }}>
                  {formatTokens(t.windowTokens)}
                </span>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 18,
                  flexWrap: "wrap",
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#52525B",
                }}
              >
                <span>{t.memberCount} members</span>
                <span>{t.contributors} burning</span>
                <span>{formatTokens(t.totalTokens)} all-time</span>
                {t.description && <span>{t.description}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {company.canManage && (
        <form onSubmit={attach} style={{ ...card, marginTop: 12, display: "grid", gap: 14 }}>
          <div>
            <label style={fieldLabel}>Attach a club</label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="club slug you own, e.g. platform-eng"
              style={input}
              disabled={!company.billing.writable || full}
            />
          </div>
          {error && <div style={{ color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>}
          <button
            type="submit"
            disabled={busy || !ref.trim() || !company.billing.writable || full}
            style={{
              ...primaryBtn,
              justifySelf: "start",
              opacity: company.billing.writable && !full ? 1 : 0.45,
              cursor: company.billing.writable && !full ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Attaching…" : "Attach club"}
          </button>
          <p style={{ margin: 0, color: "#52525B", fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>
            {!company.billing.writable
              ? "Needs an active subscription."
              : full
                ? `This plan holds ${company.teamLimit} clubs.`
                : "You have to own the club. Its roster, keys, and budget don't move."}
          </p>
        </form>
      )}
    </section>
  );
}

function Compare({ company, teams }: { company: Company; teams: Team[] }) {
  const [a, setA] = useState(teams[0]?.slug ?? "");
  const [b, setB] = useState(teams[1]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<H2HResult | null>(null);

  if (teams.length < 2) return null;

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The API scores it, not the browser: doing the maths here would give
      // the page a second opinion about who won.
      const res = await fetch(
        `/api/companies/${company.id}/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
      );
      const data = (await res.json()) as H2HResult & { ok: boolean; message?: string };
      if (data.ok) setResult(data);
      else {
        setResult(null);
        setError(data.message ?? "Couldn't compare those clubs.");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={sectionTitle}>Club vs club</h2>
      <form onSubmit={compare} style={{ ...card, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={fieldLabel}>Club A</label>
            <select value={a} onChange={(e) => setA(e.target.value)} style={input}>
              {teams.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={fieldLabel}>Club B</label>
            <select value={b} onChange={(e) => setB(e.target.value)} style={input}>
              {teams.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy || a === b} style={primaryBtn}>
            {busy ? "Scoring…" : "Compare"}
          </button>
        </div>
        {error && <div style={{ color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>}
      </form>

      {result && <Scoreboard result={result} />}
    </section>
  );
}

function Scoreboard({ result }: { result: H2HResult }) {
  const { verdict } = result;
  return (
    <div style={{ ...card, marginTop: 12, padding: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 16,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div style={{ textAlign: "right", color: "#FAFAFA", fontSize: 15, fontWeight: 700 }}>
          {result.left.name}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: "#3F3F46" }}>
          <span style={{ color: verdict.winner === "left" ? "#D97706" : "#3F3F46" }}>
            {verdict.left}
          </span>
          <span style={{ color: "#27272A" }}>—</span>
          <span style={{ color: verdict.winner === "right" ? "#D97706" : "#3F3F46" }}>
            {verdict.right}
          </span>
        </div>
        <div style={{ color: "#FAFAFA", fontSize: 15, fontWeight: 700 }}>{result.right.name}</div>
      </div>

      {result.metrics.map((m) => (
        <div
          key={m.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 150px 1fr",
            alignItems: "center",
            padding: "12px 0",
            borderTop: "1px solid #18181B",
            fontFamily: MONO,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: m.outcome === "left" ? "#D97706" : "#52525B",
              textAlign: "right",
              paddingRight: 14,
            }}
          >
            {m.leftDisplay}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#3F3F46",
              letterSpacing: 1,
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            {m.label}
            <div style={{ fontSize: 8, color: "#27272A", textTransform: "none", letterSpacing: 0, marginTop: 3 }}>
              {m.unscored ? "context only" : m.hint}
            </div>
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: m.outcome === "right" ? "#D97706" : "#52525B",
              textAlign: "left",
              paddingLeft: 14,
            }}
          >
            {m.rightDisplay}
          </div>
        </div>
      ))}

      <div
        style={{
          marginTop: 18,
          padding: "16px 18px",
          borderRadius: 10,
          background: verdict.winner === "draw" ? "#09090B" : "#D9770610",
          border: `1px solid ${verdict.winner === "draw" ? "#18181B" : "#D9770633"}`,
        }}
      >
        <div style={{ ...eyebrow, color: "#52525B", marginBottom: 8 }}>Verdict</div>
        <div style={{ fontSize: 14, color: "#E4E4E7", lineHeight: 1.6 }}>{verdict.summary}</div>
      </div>
    </div>
  );
}

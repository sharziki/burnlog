"use client";

import { useState } from "react";
import { formatTokens } from "@/lib/format";
import type { ClubPlanLimits } from "@/lib/clubPlan";
import type { CompanyListRow } from "@/lib/companies";
import {
  MONO,
  SANS,
  card,
  eyebrow,
  fieldLabel,
  input,
  primaryBtn,
  sectionTitle,
  statusChrome,
} from "./ui";

export function CompaniesClient({
  companies,
  signedIn,
  billingLive,
  plan,
}: {
  companies: CompanyListRow[];
  signedIn: boolean;
  billingLive: boolean;
  plan: ClubPlanLimits;
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
      <div style={eyebrow}>Companies</div>
      <h1 style={{ margin: "10px 0 0", fontSize: 40, lineHeight: 1.05, color: "#FAFAFA" }}>
        Every club under one roof.
      </h1>
      <p style={{ margin: "14px 0 0", color: "#A1A1AA", fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>
        ${plan.monthlyPriceUsdFlat} a month, flat, for up to {plan.teamLimit} clubs. One rollup
        across all of them, and any two can be put head-to-head.
      </p>

      {!billingLive && <BillingOffNotice />}

      <div style={{ marginTop: 24 }}>
        {signedIn ? (
          <button onClick={() => setCreating((v) => !v)} style={primaryBtn}>
            {creating ? "Cancel" : "New company"}
          </button>
        ) : (
          <a href="/api/auth/signin?callbackUrl=/companies" style={primaryBtn}>
            Sign in to start one
          </a>
        )}
      </div>

      {creating && <CreateForm />}

      <section style={{ marginTop: 36 }}>
        <h2 style={sectionTitle}>{signedIn ? "Your companies" : "Nothing to show yet"}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {companies.length === 0 ? (
            <div
              style={{
                ...card,
                textAlign: "center",
                color: "#52525B",
                fontFamily: MONO,
                fontSize: 12,
              }}
            >
              {signedIn
                ? "No companies yet. Create one, then attach the clubs you already own."
                : "Companies are private to their members — sign in to see yours."}
            </div>
          ) : (
            companies.map((c) => <CompanyCard key={c.id} company={c} />)
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Says out loud that this deployment can't charge. Without it a self-hosted
 * instance looks identical to a paid one, and "the Company tier is free here"
 * is not something anyone should have to infer from a missing button.
 */
function BillingOffNotice() {
  return (
    <div
      style={{
        ...card,
        marginTop: 20,
        borderColor: "#D9770644",
        background: "#0F0D0A",
      }}
    >
      <div style={{ ...eyebrow, color: "#D97706" }}>Billing is off</div>
      <p style={{ margin: "10px 0 0", color: "#A1A1AA", fontSize: 13, lineHeight: 1.6 }}>
        No Stripe keys are set on this deployment, so companies are unbilled and every Company
        feature is open. Set{" "}
        <code style={{ fontFamily: MONO, color: "#D97706" }}>STRIPE_SECRET_KEY</code> and{" "}
        <code style={{ fontFamily: MONO, color: "#D97706" }}>STRIPE_PRICE_ID</code> to sell it.
      </p>
    </div>
  );
}

function CompanyCard({ company }: { company: CompanyListRow }) {
  const chrome = statusChrome(company.billing);
  return (
    <a
      href={`/companies/${company.slug}`}
      style={{ ...card, display: "block", textDecoration: "none" }}
      className="hover-lift"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "#FAFAFA", fontSize: 16, fontWeight: 600 }}>{company.name}</span>
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
          {company.plan}
        </span>
        <span
          style={{
            marginLeft: "auto",
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
        <p style={{ margin: "10px 0 0", color: "#71717A", fontSize: 13, lineHeight: 1.55 }}>
          {company.description}
        </p>
      )}
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
        <span>
          {company.teamCount}/{company.limits.teamLimit} clubs
        </span>
        <span>{company.memberCount} members</span>
        <span style={{ color: "#A1A1AA" }}>{formatTokens(company.windowTokens)} · 30d</span>
        <span>{formatTokens(company.totalTokens)} all-time</span>
        {!company.isOwner && <span>owned by @{company.owner.username}</span>}
      </div>
    </a>
  );
}

function CreateForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        company?: { slug: string };
      };
      if (data.ok && data.company) window.location.href = `/companies/${data.company.slug}`;
      else setError(data.message ?? "Couldn't create the company.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...card, marginTop: 16, display: "grid", gap: 18 }}>
      <div>
        <label style={fieldLabel}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ACME Engineering"
          maxLength={60}
          style={input}
        />
      </div>
      <div>
        <label style={fieldLabel}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional — what this company covers"
          maxLength={500}
          style={input}
        />
      </div>

      {error && <div style={{ color: "#EF4444", fontFamily: MONO, fontSize: 12 }}>{error}</div>}

      <button type="submit" disabled={busy || !name.trim()} style={{ ...primaryBtn, justifySelf: "start" }}>
        {busy ? "Creating…" : "Create company"}
      </button>
      <p style={{ margin: 0, color: "#52525B", fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>
        Free to create. Attaching clubs needs an active subscription.
      </p>
    </form>
  );
}

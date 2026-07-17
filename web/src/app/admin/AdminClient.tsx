"use client";

import { useEffect, useMemo, useState } from "react";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';
const STATUSES = ["new", "contacted", "qualified", "pilot", "won", "lost"];
const PLANS = ["free", "team", "enterprise"];

type Lead = {
  email: string;
  name: string | null;
  company: string | null;
  teamSize: string | null;
  useCase: string | null;
  source: string | null;
  status: string;
  adminNotes?: string | null;
  updatedAt: string;
};

type Club = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner: { email: string | null; username: string | null; name: string | null };
  lead: { email: string; company: string | null; status: string; adminNotes: string | null; updatedAt: string } | null;
  memberCount: number;
  teamKeyCount: number;
  overPlanLimit: boolean;
  estimatedMrrUsd: number | null;
  periodTokens: number;
  estimatedPeriodSpendUsd: number;
  monthlyBudgetTokens: number;
  budgetPercentUsed: number | null;
  budgetStatus: "none" | "ok" | "warning" | "over";
};

type Summary = {
  totals: {
    users: number;
    clubs: number;
    teamApiKeys: number;
    leads: number;
    mtdTokens: number;
    estimatedMrrUsd: number;
    forcedPlanOverrides: number;
    overLimitClubs: number;
  };
  leadsByStatus: Record<string, number>;
  clubsByPlan: Record<string, number>;
  recentForcedPlanOverrides: Array<{
    clubId: string;
    meta: string | null;
    createdAt: string;
    club: { name: string; slug: string; plan: string };
  }>;
};

type Draft = { status: string; adminNotes: string };
type PlanDraft = { plan: string; force: boolean };

export function AdminClient() {
  const [token, setToken] = useState("");
  const [periodFrom, setPeriodFrom] = useState(() => monthStartInput());
  const [periodTo, setPeriodTo] = useState(() => dateInput(new Date()));
  const [planFilter, setPlanFilter] = useState("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadSourceFilter, setLeadSourceFilter] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Enter admin token to load ops data.");

  useEffect(() => {
    const saved = window.localStorage.getItem("burnlog:admin-token") ?? "";
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, []);

  const hotLeads = useMemo(
    () => leads.filter((lead) => ["qualified", "pilot"].includes(lead.status)).slice(0, 8),
    [leads],
  );
  const riskClubs = useMemo(
    () => clubs
      .filter((club) => club.overPlanLimit || ["over", "warning"].includes(club.budgetStatus))
      .concat(clubs.filter((club) => !club.overPlanLimit && !["over", "warning"].includes(club.budgetStatus)))
      .slice(0, 12),
    [clubs],
  );

  async function authedJson<T>(path: string, authToken = token, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
    return json as T;
  }

  async function load(authToken = token) {
    if (!authToken.trim()) {
      setMessage("Token required.");
      return;
    }
    setBusy(true);
    setMessage("Loading admin data...");
    try {
      window.localStorage.setItem("burnlog:admin-token", authToken);
      const [summaryRes, clubsRes, leadsRes] = await Promise.all([
        authedJson<{ ok: true } & Summary>("/api/admin/summary", authToken),
        authedJson<{ ok: true; clubs: Club[] }>(`/api/admin/clubs?${accountQuery(periodFrom, periodTo, planFilter)}`, authToken),
        authedJson<{ ok: true; leads: Lead[] }>(`/api/team-leads?format=json&${leadQuery(leadStatusFilter, leadSourceFilter)}`, authToken),
      ]);
      setSummary(summaryRes);
      setClubs(clubsRes.clubs);
      setLeads(leadsRes.leads);
      setDrafts(Object.fromEntries(leadsRes.leads.map((lead) => [
        lead.email,
        { status: lead.status, adminNotes: lead.adminNotes ?? "" },
      ])));
      setPlanDrafts(Object.fromEntries(clubsRes.clubs.map((club) => [
        club.id,
        { plan: club.plan, force: false },
      ])));
      setMessage(`Loaded ${leadsRes.leads.length} leads and ${clubsRes.clubs.length} accounts.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLead(email: string) {
    const draft = drafts[email];
    if (!draft) return;
    setBusy(true);
    setMessage(`Saving ${email}...`);
    try {
      await authedJson("/api/team-leads", token, {
        method: "PATCH",
        body: JSON.stringify({ email, status: draft.status, adminNotes: draft.adminNotes }),
      });
      await load(token);
      setMessage(`Saved ${email}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(club: Club) {
    const draft = planDrafts[club.id];
    if (!draft) return;
    setBusy(true);
    setMessage(`Updating ${club.name} to ${draft.plan}...`);
    try {
      await authedJson(`/api/clubs/${club.id}/plan`, token, {
        method: "PATCH",
        body: JSON.stringify({ plan: draft.plan, force: draft.force }),
      });
      await load(token);
      setMessage(`Updated ${club.name} to ${draft.plan}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Plan update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv(path: string, filename: string) {
    if (!token.trim()) {
      setMessage("Token required.");
      return;
    }
    setBusy(true);
    setMessage(`Downloading ${filename}...`);
    try {
      const res = await fetch(path, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded ${filename}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  function forgetToken() {
    window.localStorage.removeItem("burnlog:admin-token");
    setToken("");
    setSummary(null);
    setClubs([]);
    setLeads([]);
    setDrafts({});
    setPlanDrafts({});
    setMessage("Admin token cleared.");
  }

  const totals = summary?.totals;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 72px", color: "#E4E4E7", fontFamily: SANS }}>
      <section style={{ display: "grid", gap: 18, borderBottom: "1px solid #18181B", paddingBottom: 26 }}>
        <div style={eyebrow}>burnlog admin</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: 18 }} className="admin-shell">
          <div>
            <h1 style={{ margin: 0, color: "#FAFAFA", fontSize: 34, lineHeight: 1.1, letterSpacing: 0 }}>
              Operator console
            </h1>
            <p style={{ margin: "10px 0 0", color: "#A1A1AA", fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>
              Leads, MRR estimate, over-limit accounts, and forced plan overrides in one place.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(token);
            }}
            style={{ ...panel, display: "grid", gap: 10 }}
          >
            <label style={label} htmlFor="admin-token">Admin token</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }} className="admin-token-row">
              <input
                id="admin-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                autoComplete="off"
                placeholder="BURNLOG_ADMIN_TOKEN"
                style={input}
              />
              <button type="submit" disabled={busy} style={button}>
                {busy ? "..." : "Load"}
              </button>
              <button type="button" onClick={forgetToken} style={secondaryButton}>
                Forget
              </button>
            </div>
            <div style={{ color: message.includes("failed") || message.includes("unauthorized") ? "#F87171" : "#71717A", fontSize: 11, fontFamily: MONO }}>
              {message}
            </div>
          </form>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }} className="admin-shell">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 180px))", gap: 10 }} className="admin-period">
            <div>
              <label htmlFor="period-from" style={label}>Period from</label>
              <input id="period-from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={{ ...input, marginTop: 6 }} />
            </div>
            <div>
              <label htmlFor="period-to" style={label}>Period to</label>
              <input id="period-to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={{ ...input, marginTop: 6 }} />
            </div>
            <div>
              <label htmlFor="plan-filter" style={label}>Plan</label>
              <select id="plan-filter" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} style={{ ...input, marginTop: 6 }}>
                <option value="all">all</option>
                {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lead-status-filter" style={label}>Lead status</label>
              <select id="lead-status-filter" value={leadStatusFilter} onChange={(e) => setLeadStatusFilter(e.target.value)} style={{ ...input, marginTop: 6 }}>
                <option value="all">all</option>
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lead-source-filter" style={label}>Lead source</label>
              <input
                id="lead-source-filter"
                value={leadSourceFilter}
                onChange={(e) => setLeadSourceFilter(e.target.value)}
                placeholder="teams_page"
                style={{ ...input, marginTop: 6 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" disabled={busy} onClick={() => void load(token)} style={smallButton}>Reload period</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv(`/api/admin/clubs?format=csv&${accountQuery(periodFrom, periodTo, planFilter)}`, `burnlog-accounts-${planFilter}-${periodFrom}-to-${periodTo}.csv`)}
              style={secondaryButton}
            >
              Accounts CSV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv(`/api/admin/clubs?overLimit=true&format=csv&${accountQuery(periodFrom, periodTo, planFilter)}`, `burnlog-over-limit-${planFilter}-${periodFrom}-to-${periodTo}.csv`)}
              style={secondaryButton}
            >
              Over-limit CSV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv(`/api/admin/clubs?budgetRisk=true&format=csv&${accountQuery(periodFrom, periodTo, planFilter)}`, `burnlog-budget-risk-${planFilter}-${periodFrom}-to-${periodTo}.csv`)}
              style={secondaryButton}
            >
              Budget-risk CSV
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv(`/api/team-leads?${leadQuery(leadStatusFilter, leadSourceFilter)}`, `burnlog-team-leads-${leadStatusFilter}${leadSourceFilter ? `-${leadSourceFilter}` : ""}.csv`)}
              style={secondaryButton}
            >
              Leads CSV
            </button>
          </div>
        </div>
      </section>

      {totals && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, marginTop: 18 }} className="admin-kpis">
          <Kpi label="MRR est." value={money(totals.estimatedMrrUsd)} />
          <Kpi label="MTD tokens" value={compact(totals.mtdTokens)} />
          <Kpi label="Leads" value={String(totals.leads)} />
          <Kpi label="Team keys" value={String(totals.teamApiKeys)} />
          <Kpi label="Over limit" value={String(totals.overLimitClubs)} tone={totals.overLimitClubs ? "warn" : "ok"} />
          <Kpi label="Forced" value={String(totals.forcedPlanOverrides)} tone={totals.forcedPlanOverrides ? "warn" : "ok"} />
        </section>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)", gap: 14, marginTop: 18 }} className="admin-shell">
        <div style={panel}>
          <SectionHead title="Pipeline" meta={summary ? statusLine(summary.leadsByStatus) : "No data"} />
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {(hotLeads.length ? hotLeads : leads.slice(0, 8)).map((lead) => (
              <div key={lead.email} style={row} className="admin-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#FAFAFA", fontWeight: 800, fontSize: 14 }}>{lead.company ?? lead.email}</div>
                  <div style={muted}>{lead.email} · {lead.teamSize ?? "team size unknown"} · {lead.source ?? "unknown"}</div>
                  <div style={{ ...muted, marginTop: 4 }}>{lead.useCase ?? "No use case noted"}</div>
                  <textarea
                    value={drafts[lead.email]?.adminNotes ?? ""}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [lead.email]: { status: prev[lead.email]?.status ?? lead.status, adminNotes: e.target.value },
                    }))}
                    placeholder="admin notes"
                    rows={2}
                    style={{ ...input, marginTop: 8, minHeight: 58, resize: "vertical" }}
                  />
                </div>
                <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                  <select
                    value={drafts[lead.email]?.status ?? lead.status}
                    onChange={(e) => setDrafts((prev) => ({
                      ...prev,
                      [lead.email]: { status: e.target.value, adminNotes: prev[lead.email]?.adminNotes ?? "" },
                    }))}
                    style={input}
                  >
                    {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => void saveLead(lead.email)} style={smallButton}>Save</button>
                </div>
              </div>
            ))}
            {!leads.length && <Empty text="No leads loaded." />}
          </div>
        </div>

        <div style={panel}>
          <SectionHead title="Risk" meta={summary ? planLine(summary.clubsByPlan) : "No data"} />
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {riskClubs.map((club) => (
              <div key={club.id} style={row} className="admin-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#FAFAFA", fontWeight: 800, fontSize: 14 }}>{club.name}</div>
                  <div style={muted}>{club.owner.email ?? club.owner.username ?? "no owner"} · {club.memberCount} seats · {club.teamKeyCount} keys</div>
                  <div style={{ ...muted, marginTop: 4 }}>{compact(club.periodTokens)} tokens · {money(club.estimatedPeriodSpendUsd)} spend</div>
                  {club.budgetPercentUsed !== null && (
                    <div style={{ ...muted, marginTop: 4 }}>
                      Budget: {club.budgetPercentUsed}% of {compact(club.monthlyBudgetTokens)}
                    </div>
                  )}
                  {club.lead && (
                    <div style={{ ...muted, marginTop: 4, color: "#A1A1AA" }}>
                      Lead: {club.lead.company ?? club.lead.email} · {club.lead.status}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                  <span style={badge(club.overPlanLimit ? "warn" : "ok")}>{club.overPlanLimit ? "over limit" : club.plan}</span>
                  {club.budgetStatus !== "none" && (
                    <span style={badge(club.budgetStatus === "ok" ? "ok" : "warn")}>{club.budgetStatus}</span>
                  )}
                  <span style={{ color: "#FAFAFA", fontFamily: MONO, fontSize: 12 }}>{club.estimatedMrrUsd === null ? "custom" : money(club.estimatedMrrUsd)}</span>
                  <select
                    value={planDrafts[club.id]?.plan ?? club.plan}
                    onChange={(e) => setPlanDrafts((prev) => ({
                      ...prev,
                      [club.id]: { plan: e.target.value, force: prev[club.id]?.force ?? false },
                    }))}
                    style={input}
                    aria-label={`${club.name} plan`}
                  >
                    {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                  </select>
                  <label style={{ ...muted, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, fontFamily: MONO }}>
                    <input
                      type="checkbox"
                      checked={planDrafts[club.id]?.force ?? false}
                      onChange={(e) => setPlanDrafts((prev) => ({
                        ...prev,
                        [club.id]: { plan: prev[club.id]?.plan ?? club.plan, force: e.target.checked },
                      }))}
                    />
                    force
                  </label>
                  <button
                    type="button"
                    disabled={busy || (planDrafts[club.id]?.plan ?? club.plan) === club.plan}
                    onClick={() => void savePlan(club)}
                    style={{
                      ...smallButton,
                      opacity: busy || (planDrafts[club.id]?.plan ?? club.plan) === club.plan ? 0.45 : 1,
                      cursor: busy || (planDrafts[club.id]?.plan ?? club.plan) === club.plan ? "not-allowed" : "pointer",
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ))}
            {!clubs.length && <Empty text="No accounts loaded." />}
          </div>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 14 }}>
        <SectionHead title="Forced overrides" meta="Plan changes needing review" />
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {(summary?.recentForcedPlanOverrides ?? []).map((event) => (
            <div key={`${event.clubId}-${event.createdAt}`} style={row} className="admin-row">
              <div>
                <div style={{ color: "#FAFAFA", fontWeight: 800, fontSize: 14 }}>{event.club.name}</div>
                <div style={muted}>{new Date(event.createdAt).toLocaleString()} · {event.club.slug} · now {event.club.plan}</div>
              </div>
              <code style={{ color: "#A1A1AA", fontSize: 11, fontFamily: MONO, overflowWrap: "anywhere" }}>{event.meta}</code>
            </div>
          ))}
          {!summary?.recentForcedPlanOverrides.length && <Empty text="No forced overrides." />}
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div style={panel}>
      <div style={labelStyle}>{label}</div>
      <div style={{ color: tone === "warn" ? "#D97706" : "#FAFAFA", fontFamily: MONO, fontSize: 22, fontWeight: 900, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <h2 style={{ margin: 0, color: "#FAFAFA", fontSize: 16 }}>{title}</h2>
      <div style={{ ...muted, textAlign: "right" }}>{meta}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ border: "1px dashed #27272A", borderRadius: 8, padding: 16, color: "#71717A", fontSize: 13 }}>{text}</div>;
}

function statusLine(value: Record<string, number>) {
  return STATUSES.map((status) => `${status}:${value[status] ?? 0}`).join(" · ");
}

function planLine(value: Record<string, number>) {
  return ["free", "team", "enterprise"].map((plan) => `${plan}:${value[plan] ?? 0}`).join(" · ");
}

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function money(value: number) {
  return Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStartInput() {
  const now = new Date();
  return dateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function accountQuery(from: string, to: string, plan: string) {
  return new URLSearchParams({ from, to, ...(plan === "all" ? {} : { plan }) }).toString();
}

function leadQuery(status: string, source: string) {
  return new URLSearchParams({
    ...(status === "all" ? {} : { status }),
    ...(source.trim() ? { source: source.trim() } : {}),
  }).toString();
}

const panel: React.CSSProperties = {
  border: "1px solid #18181B",
  borderRadius: 8,
  background: "#0C0C0E",
  padding: 16,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "start",
  border: "1px solid #18181B",
  borderRadius: 8,
  padding: 12,
  background: "#09090B",
};

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  color: "#6B7280",
  letterSpacing: 2,
  textTransform: "uppercase",
  fontFamily: MONO,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#71717A",
  letterSpacing: 1.4,
  textTransform: "uppercase",
  fontFamily: MONO,
};

const label: React.CSSProperties = {
  ...labelStyle,
  color: "#A1A1AA",
};

const muted: React.CSSProperties = {
  color: "#71717A",
  fontSize: 12,
  lineHeight: 1.45,
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #27272A",
  borderRadius: 7,
  background: "#09090B",
  color: "#FAFAFA",
  padding: "10px 11px",
  fontSize: 12,
  fontFamily: MONO,
};

const button: React.CSSProperties = {
  border: 0,
  borderRadius: 7,
  background: "#D97706",
  color: "#09090B",
  padding: "0 16px",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const smallButton: React.CSSProperties = {
  ...button,
  padding: "10px 12px",
};

const secondaryButton: React.CSSProperties = {
  ...smallButton,
  background: "transparent",
  color: "#D97706",
  border: "1px solid #27272A",
};

function badge(tone: "ok" | "warn") {
  return {
    border: `1px solid ${tone === "warn" ? "#92400E" : "#064E3B"}`,
    borderRadius: 999,
    color: tone === "warn" ? "#D97706" : "#10B981",
    padding: "4px 8px",
    fontFamily: MONO,
    fontSize: 10,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  } satisfies React.CSSProperties;
}

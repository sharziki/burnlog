import type { Metadata } from "next";
import { CLUB_PLANS } from "@/lib/clubPlan";
import { TeamLeadForm } from "./TeamLeadForm";

export const metadata: Metadata = {
  title: "teams",
  description: "burnlog for engineering teams tracking AI coding spend and usage.",
};

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';

const features = [
  ["Private workspaces", "Invite-only teams for engineering, FinOps, platform, or agency groups."],
  ["Budget controls", "Monthly token budgets, 80% / 100% alerts, and owner notifications."],
  ["Team API keys", "Separate shared CI, service, and agent usage from personal developer usage."],
  ["Agent readback", "MCP tools let Claude Code, Cursor, or Codex answer team budget questions."],
  ["CSV exports", "Usage reports for finance reviews, client billing, or weekly ops meetings."],
  ["Privacy-first ingest", "Tokens and opaque request ids only. No prompts, paths, code, or repo names."],
];

const plans = [
  {
    name: "Open source",
    price: "$0",
    fit: "solo builders and self-hosted teams",
    items: ["CLI + SDK + MCP", "public leaderboard", "self-hostable Postgres app"],
  },
  {
    name: "Team",
    price: `$${CLUB_PLANS.team.monthlyPriceUsdPerSeat}`,
    sub: "per active member / month",
    fit: "engineering groups tracking shared AI spend",
    items: ["private teams", "team API keys", "budget alerts", "CSV exports"],
  },
  {
    name: "Business",
    price: "custom",
    fit: "teams needing procurement, controls, or support",
    items: ["usage review help", "priority support", "deployment guidance", "custom limits"],
  },
];

export default function TeamsPage() {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "56px 24px 72px",
        color: "#E4E4E7",
        fontFamily: SANS,
      }}
    >
      <section style={{ display: "grid", gap: 28, borderBottom: "1px solid #18181B", paddingBottom: 40 }}>
        <div style={{ fontSize: 10, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase", fontFamily: MONO }}>
          burnlog for teams
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, 0.85fr)", gap: 28, alignItems: "start" }} className="teams-hero">
          <div>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: 0, color: "#FAFAFA", letterSpacing: 0 }}>
              Control AI coding spend before it becomes a finance surprise.
            </h1>
            <p style={{ margin: "18px 0 0", color: "#A1A1AA", fontSize: 16, lineHeight: 1.7, maxWidth: 660 }}>
              burnlog turns local agent token usage into team budgets, private workspaces, API-key ingest, alerts, and reports. Built for engineering leaders who need visibility without collecting prompts or code.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <a href="/settings" style={primaryLink}>Create API key</a>
              <a href="#team-access" style={secondaryLink}>Request team access</a>
            </div>
          </div>
          <div style={{ border: "1px solid #18181B", borderRadius: 10, background: "#0C0C0E", padding: 20 }}>
            {[
              ["Team budget", "4.57M / 5.0M", "warning"],
              ["Shared CI usage", "1.5K tokens", "tracked"],
              ["Private workspace", "invite-only", "active"],
              ["Alert state", "91% used", "owner notified"],
            ].map(([label, value, status]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 0", borderBottom: label === "Alert state" ? "none" : "1px solid #18181B" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#52525B", fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 18, color: "#FAFAFA", fontWeight: 800, fontFamily: MONO, marginTop: 2 }}>{value}</div>
                </div>
                <span style={{ alignSelf: "center", color: status === "warning" ? "#D97706" : "#10B981", fontSize: 10, fontFamily: MONO, textTransform: "uppercase" }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={sectionTitle}>What teams get</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }} className="teams-grid">
          {features.map(([title, body]) => (
            <div key={title} style={panel}>
              <h3 style={{ margin: 0, color: "#FAFAFA", fontSize: 15 }}>{title}</h3>
              <p style={{ margin: "8px 0 0", color: "#71717A", fontSize: 13, lineHeight: 1.55 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={sectionTitle}>Pricing direction</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }} className="teams-grid">
          {plans.map((p) => (
            <div key={p.name} style={{ ...panel, minHeight: 230 }}>
              <div style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase" }}>{p.name}</div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ color: "#FAFAFA", fontSize: 30, fontWeight: 800, fontFamily: MONO }}>{p.price}</span>
                {p.sub && <span style={{ color: "#52525B", fontSize: 11 }}>{p.sub}</span>}
              </div>
              <p style={{ margin: "8px 0 14px", color: "#71717A", fontSize: 13 }}>{p.fit}</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#A1A1AA", fontSize: 13, lineHeight: 1.8 }}>
                {p.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 36, ...panel }}>
        <h2 style={{ margin: 0, color: "#FAFAFA", fontSize: 18 }}>Buyer-fit checklist</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 16 }} className="teams-grid">
          {["AI pair-programming rollout", "client billing for agent work", "platform budget review", "privacy-sensitive codebases"].map((item) => (
            <div key={item} style={{ border: "1px solid #18181B", borderRadius: 8, padding: 12, color: "#A1A1AA", fontSize: 12, fontFamily: MONO }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="team-access" style={{ marginTop: 36, ...panel }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(280px, 1.2fr)", gap: 20 }} className="teams-hero">
          <div>
            <h2 style={{ margin: 0, color: "#FAFAFA", fontSize: 20 }}>Pilot with a real team</h2>
            <p style={{ margin: "10px 0 0", color: "#71717A", fontSize: 13, lineHeight: 1.6 }}>
              Share buyer context. burnlog stores this as a lead so pilots, pricing, and support can be handled outside the public leaderboard.
            </p>
          </div>
          <TeamLeadForm />
        </div>
      </section>
    </main>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid #18181B",
  borderRadius: 10,
  background: "#0C0C0E",
  padding: 18,
};

const sectionTitle: React.CSSProperties = {
  color: "#6B7280",
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  margin: "0 0 14px",
};

const primaryLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  borderRadius: 7,
  background: "#D97706",
  color: "#09090B",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  borderRadius: 7,
  border: "1px solid #27272A",
  color: "#A1A1AA",
  fontFamily: MONO,
  fontSize: 12,
  textDecoration: "none",
};

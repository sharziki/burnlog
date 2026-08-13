import type { Metadata } from "next";
import { CLUB_PLANS } from "@/lib/clubPlan";
import { TeamLeadForm } from "./TeamLeadForm";
import { requireFullSurface } from "@/lib/surface";

export const metadata: Metadata = {
  title: "pricing",
  description: "burnlog for engineering teams tracking AI coding spend and usage.",
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

type Plan = {
  name: string;
  price: string;
  sub?: string;
  fit: string;
  items: string[];
  /** Draws the amber outline. One plan at a time, or it stops meaning anything. */
  featured?: boolean;
};

const plans: Plan[] = [
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
    items: ["private clubs", "club API keys", "budget alerts", "CSV exports"],
  },
  {
    name: "Company",
    price: `$${CLUB_PLANS.company.monthlyPriceUsdFlat}`,
    sub: "flat / month, all clubs",
    fit: "orgs running several clubs under one roof",
    items: [
      `up to ${CLUB_PLANS.company.teamLimit} clubs in one company`,
      "club vs club head-to-head",
      "company-wide rollups",
      "everything in Team",
    ],
    featured: true,
  },
  {
    name: "Business",
    price: "custom",
    fit: "teams needing procurement, controls, or support",
    items: ["usage review help", "priority support", "deployment guidance", "custom limits"],
  },
];

export default function TeamsPage() {
  requireFullSurface();
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
              Club budgets, private workspaces, and alerts — from token counts alone. No prompts, no code.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <a href="/settings" style={primaryLink}>Create API key</a>
              <a href="#team-access" style={secondaryLink}>Request team access</a>
            </div>
          </div>
          <div style={{ border: "1px solid #18181B", borderRadius: 10, background: "#0C0C0E", padding: 20 }}>
            {[
              ["Club budget", "4.57M / 5.0M", "warning"],
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
        <h2 style={sectionTitle}>Pricing direction</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }} className="teams-grid">
          {plans.map((p) => (
            <div
              key={p.name}
              style={{
                ...panel,
                minHeight: 230,
                ...(p.featured ? { borderColor: "#D97706", background: "#0F0D0A" } : null),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#D97706", fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase" }}>{p.name}</span>
                {p.featured && (
                  <span style={{ fontSize: 9, color: "#09090B", background: "#D97706", fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>
                    new
                  </span>
                )}
              </div>
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

      <section style={{ marginTop: 36 }}>
        <h2 style={sectionTitle}>Club vs club</h2>
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ ...panel, padding: 20 }}>
            {/* The two sides need names, or the columns are just unlabelled
                numbers and the reader has to guess which is which. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #18181B" }}>
              <div style={{ textAlign: "right", color: "#FAFAFA", fontSize: 15, fontWeight: 600 }}>Platform</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: "#52525B", textTransform: "uppercase", letterSpacing: 1, textAlign: "center", minWidth: 88 }}>
                last 30 days
              </div>
              <div style={{ color: "#FAFAFA", fontSize: 15, fontWeight: 600 }}>Growth</div>
            </div>
            {[
              ["Recent form", "8.2M", "6.9M", "left"],
              ["Peak day", "1.1M", "1.4M", "right"],
              ["Active days", "27/30", "26/30", "tie"],
              ["Contributors", "9", "6", "left"],
              ["Range", "5", "5", "tie"],
            ].map(([label, left, right, side]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #18181B" }}>
                <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 13, color: side === "left" ? "#D97706" : "#A1A1AA", fontWeight: side === "left" ? 800 : 400 }}>{left}</div>
                <div style={{ fontSize: 9, color: "#52525B", fontFamily: MONO, textTransform: "uppercase", letterSpacing: 1, textAlign: "center", minWidth: 88 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: side === "right" ? "#D97706" : "#A1A1AA", fontWeight: side === "right" ? 800 : 400 }}>{right}</div>
              </div>
            ))}
            <p style={{ margin: "12px 0 0", color: "#71717A", fontSize: 12, lineHeight: 1.55, textAlign: "center" }}>
              Rolling 30 days, so the older club doesn&apos;t win on back catalogue.
            </p>
          </div>
        </div>
      </section>


      <section id="team-access" style={{ marginTop: 36, ...panel }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(280px, 1.2fr)", gap: 20 }} className="teams-hero">
          <div>
            <h2 style={{ margin: 0, color: "#FAFAFA", fontSize: 20 }}>Pilot with a real team</h2>
            <p style={{ margin: "10px 0 0", color: "#71717A", fontSize: 13, lineHeight: 1.6 }}>
              Tell us what you need to control. We&apos;ll take it from there.
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

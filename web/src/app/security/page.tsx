import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "security",
  description: "burnlog security posture and operational controls.",
  alternates: { canonical: "/security" },
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export default function SecurityPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "64px 24px",
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        color: "#E4E4E7",
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontSize: 10, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase", fontFamily: MONO }}>
        burnlog · security
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 32px", color: "#fff" }}>
        Built to track spend, not secrets.
      </h1>

      <p style={{ color: "#A1A1AA" }}>
        burnlog is designed for teams that need AI-agent cost visibility without
        collecting prompts, code, repo names, or paths.
      </p>

      <Section title="Data boundary">
        <p>
          Ingest accepts token counts, model/provider/source tags, timestamps, and
          opaque request ids, and nothing else — see the full field list in the{" "}
          <a href="/privacy" style={{ color: "#D97706" }}>privacy model</a>. Prompt text,
          completions, file paths, working directories, shell output, tool output,
          repo names, and source code are not part of the schema.
        </p>
      </Section>

      <Section title="Access controls">
        <ul style={{ color: "#A1A1AA", paddingLeft: 20 }}>
          <li>GitHub OAuth for browser login.</li>
          <li>Hashed API keys; raw keys are shown only once.</li>
          <li>Private clubs with invite codes.</li>
          <li>Owner-only club settings, key management, reports, webhooks, and audit logs.</li>
          <li>Admin token for lead export and manual plan changes.</li>
        </ul>
      </Section>

      <Section title="Spend controls">
        <ul style={{ color: "#A1A1AA", paddingLeft: 20 }}>
          <li>Monthly club budgets with warning/over notifications.</li>
          <li>Optional hard budget guard for club API key ingest.</li>
          <li>Per-club-key monthly caps for CI, services, and client-specific keys.</li>
          <li>CSV reports split service usage by key label.</li>
        </ul>
      </Section>

      <Section title="Audit and operations">
        <ul style={{ color: "#A1A1AA", paddingLeft: 20 }}>
          <li>Audit events for plan, budget/privacy/webhook, and club-key changes.</li>
          <li>Signed budget webhooks when <code style={{ color: "#D97706" }}>BURNLOG_WEBHOOK_SECRET</code> is set.</li>
          <li>Security headers block framing, MIME sniffing, broad referrers, and unused browser permissions.</li>
          <li><code style={{ color: "#D97706" }}>/api/health</code> checks database reachability for deploy monitors.</li>
          <li>Docker compose deployment keeps Postgres private to the app network.</li>
        </ul>
      </Section>

      <Section title="Responsible disclosure">
        <p>
          Report vulnerabilities to{" "}
          <a href="mailto:security@sxnalabs.com" style={{ color: "#D97706" }}>
            security@sxnalabs.com
          </a>
          . Do not open public issues for exploitable bugs. Include the affected
          route/package, reproduction steps, impact, and suggested fix if known.
        </p>
      </Section>

      <p style={{ color: "#52525B", fontSize: 12, marginTop: 48, fontFamily: MONO }}>
        Last updated: 2026-06-14
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: 11, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase", fontFamily: MONO, marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ color: "#A1A1AA" }}>{children}</div>
    </section>
  );
}

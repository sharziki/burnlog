import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "terms",
  description: "burnlog terms of service.",
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export default function TermsPage() {
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
      <div
        style={{
          fontSize: 10,
          color: "#6B7280",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: MONO,
        }}
      >
        burnlog · terms
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 32px", color: "#fff" }}>
        Terms of Service
      </h1>

      <p style={{ color: "#A1A1AA" }}>
        By using burnlog (the &quot;service&quot;), operated by Sharvil Saxena
        / SXNA Labs, you agree to these terms.
      </p>

      <Section title="1. Who can use it">
        <p>
          You must be at least 13 years old. Don&apos;t use the service to
          violate laws, harass other users, or attack the infrastructure.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You&apos;re responsible for what happens under your account and for
          keeping your API keys secret. Notify us if a key is compromised.
        </p>
      </Section>

      <Section title="3. Your data">
        <p>
          You own your data. You grant us a limited license to store and
          display the burn-event counts you upload so the service can
          function. You can delete your account at any time from{" "}
          <code style={{ color: "#D97706" }}>/settings</code>, which
          permanently removes your stored events. See the{" "}
          <a href="/privacy" style={{ color: "#D97706" }}>privacy page</a>{" "}
          for what we do and don&apos;t store.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>Don&apos;t:</p>
        <ul style={{ color: "#A1A1AA", paddingLeft: 20 }}>
          <li>Submit fabricated burn events to inflate your rank.</li>
          <li>Scrape or overload the API.</li>
          <li>Attempt to de-anonymize or harass other users.</li>
          <li>Circumvent rate limits or authentication.</li>
        </ul>
        <p>We can suspend accounts that violate these rules.</p>
      </Section>

      <Section title="5. No warranty">
        <p>
          The service is provided &quot;as is&quot;. We make no warranty that
          it will be uninterrupted, error-free, or that rankings will reflect
          reality perfectly. Leaderboards are for entertainment.
        </p>
      </Section>

      <Section title="6. Limitation of liability">
        <p>
          To the fullest extent permitted by law, SXNA Labs and Sharvil Saxena
          will not be liable for indirect, incidental, special, or
          consequential damages arising from your use of the service.
        </p>
      </Section>

      <Section title="7. Changes">
        <p>
          We may update these terms. Material changes will be announced on the
          site. Continued use after changes constitutes acceptance.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Questions:{" "}
          <a href="mailto:sharvil@sxnalabs.com" style={{ color: "#D97706" }}>
            sharvil@sxnalabs.com
          </a>
          .
        </p>
      </Section>

      <p style={{ color: "#52525B", fontSize: 12, marginTop: 48, fontFamily: MONO }}>
        Last updated: 2026-04-22
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontSize: 11,
          color: "#6B7280",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: MONO,
          marginBottom: 10,
        }}
      >
        {title}
      </h2>
      <div style={{ color: "#A1A1AA" }}>{children}</div>
    </section>
  );
}

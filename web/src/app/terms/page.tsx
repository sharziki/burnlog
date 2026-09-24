import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms covering use of burnlog.net, the CLI, and the API — acceptable use, accounts, the data you send, availability, and how the terms can change.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Terms"
      title="Terms of Service"
      intro={
        <p className="m-0">
          By using burnlog (the &quot;service&quot;), operated by Sharvil Saxena
          / SXNA Labs, you agree to these terms.
        </p>
      }
    >
      <h2>1. Who can use it</h2>
      <p>
        You must be at least 13 years old. Don&apos;t use the service to
        violate laws, harass other users, or attack the infrastructure.
      </p>

      <h2>2. Your account</h2>
      <p>
        You&apos;re responsible for what happens under your account and for
        keeping your API keys secret. Notify us if a key is compromised.
      </p>

      <h2>3. Your data</h2>
      <p>
        You own your data. You grant us a limited license to store and
        display the burn-event counts you upload so the service can
        function. You can delete your account at any time from{" "}
        <code>/settings</code>, which
        permanently removes your stored events. See the{" "}
        <a href="/privacy">privacy page</a>{" "}
        for what we do and don&apos;t store.
      </p>

      <h2>4. Acceptable use</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>Submit fabricated burn events to inflate your rank.</li>
        <li>Scrape or overload the API.</li>
        <li>Attempt to de-anonymize or harass other users.</li>
        <li>Circumvent rate limits or authentication.</li>
      </ul>
      <p>We can suspend accounts that violate these rules.</p>

      <h2>5. No warranty</h2>
      <p>
        The service is provided &quot;as is&quot;. We make no warranty that
        it will be uninterrupted, error-free, or that rankings will reflect
        reality perfectly. Leaderboards are for entertainment.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, SXNA Labs and Sharvil Saxena
        will not be liable for indirect, incidental, special, or
        consequential damages arising from your use of the service.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms. Material changes will be announced on the
        site. Continued use after changes constitutes acceptance.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:sharvil@sxnalabs.com">
          sharvil@sxnalabs.com
        </a>
        .
      </p>

      <p className="mt-12 font-mono text-[12px] text-faint">
        Last updated: 2026-04-22
      </p>
    </DocPage>
  );
}

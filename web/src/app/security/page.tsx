import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Security posture and access controls",
  description:
    "How burnlog is built to track spend without collecting secrets: the data boundary, access controls, spend guards, audit events, and operational posture.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <DocPage
      eyebrow="Security"
      title="Built to track spend, not secrets."
      intro={
        <p className="m-0">
          burnlog is designed for teams that need AI-agent cost visibility without
          collecting prompts, code, repo names, or paths.
        </p>
      }
    >
      <h2>Data boundary</h2>
      <p>
        Ingest accepts token counts, model/provider/source tags, timestamps, and
        opaque request ids, and nothing else — see the full field list in the{" "}
        <a href="/privacy">privacy model</a>. Prompt text,
        completions, file paths, working directories, shell output, tool output,
        repo names, and source code are not part of the schema.
      </p>

      <h2>Access controls</h2>
      <ul>
        <li>GitHub OAuth for browser login.</li>
        <li>Hashed API keys; raw keys are shown only once.</li>
        <li>Private clubs with invite codes.</li>
        <li>Owner-only club settings, key management, reports, webhooks, and audit logs.</li>
        <li>Admin token for lead export and manual plan changes.</li>
      </ul>

      <h2>Spend controls</h2>
      <ul>
        <li>Monthly club budgets with optional signed webhooks.</li>
        <li>Optional hard budget guard for club API key ingest.</li>
        <li>Per-club-key monthly caps for CI, services, and client-specific keys.</li>
        <li>CSV reports split service usage by key label.</li>
      </ul>

      <h2>Audit and operations</h2>
      <ul>
        <li>Audit events for plan, budget/privacy/webhook, and club-key changes.</li>
        <li>Signed budget webhooks when <code>BURNLOG_WEBHOOK_SECRET</code> is set.</li>
        <li>Security headers block framing, MIME sniffing, broad referrers, and unused browser permissions.</li>
        <li><code>/api/health</code> checks database reachability for deploy monitors.</li>
        <li>Docker compose deployment keeps Postgres private to the app network.</li>
      </ul>

      <h2>Responsible disclosure</h2>
      <p>
        Report vulnerabilities to{" "}
        <a href="mailto:security@sxnalabs.com">
          security@sxnalabs.com
        </a>
        . Do not open public issues for exploitable bugs. Include the affected
        route/package, reproduction steps, impact, and suggested fix if known.
      </p>

      <p className="mt-12 font-mono text-[12px] text-faint">
        Last updated: 2026-06-14
      </p>
    </DocPage>
  );
}

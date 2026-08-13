import type { Metadata } from "next";
import { TOOLS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Which AI coding agents burnlog tracks",
  description:
    "Claude Code, Codex, Cursor, Gemini CLI, aider, opencode — how burnlog counts each one, whether it reads local logs or counts at the wire, and what it can't see.",
  alternates: { canonical: "/tools" },
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

export default function ToolsIndex() {
  const logs = TOOLS.filter((t) => t.method === "log");
  const wire = TOOLS.filter((t) => t.method === "wrap");

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 24px 72px", fontFamily: SANS }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, color: "#FAFAFA", margin: 0 }}>
        Which agents burnlog counts
      </h1>
      <p style={{ color: "#A1A1AA", fontSize: 17, lineHeight: 1.7, margin: "18px 0 0", maxWidth: 640 }}>
        Two mechanisms, and which one applies depends on whether the agent writes its
        usage somewhere readable. Every page below says what burnlog measures, how, and
        where it stops.
      </p>

      <Group
        title="Read from local logs"
        note="The agent already writes its own usage to disk. Nothing to configure, and your first run counts history you already have."
        tools={logs}
        color="#10B981"
      />
      <Group
        title="Counted at the wire"
        note="No readable log, so burnlog reads the usage field off the API response instead — the provider's own number, not an estimate."
        tools={wire}
        color="#D97706"
      />
    </main>
  );
}

function Group({
  title,
  note,
  tools,
  color,
}: {
  title: string;
  note: string;
  tools: typeof TOOLS;
  color: string;
}) {
  return (
    <section style={{ marginTop: 44 }}>
      <h2 style={{ fontSize: 13, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase", color, margin: 0 }}>
        {title}
      </h2>
      <p style={{ color: "#71717A", fontSize: 14, lineHeight: 1.7, margin: "10px 0 18px", maxWidth: 640 }}>
        {note}
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {tools.map((t) => (
          <a
            key={t.slug}
            href={`/tools/${t.slug}`}
            style={{
              border: "1px solid #18181B",
              borderRadius: 10,
              background: "#0C0C0E",
              padding: 22,
              textDecoration: "none",
              display: "block",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#FAFAFA" }}>{t.title}</div>
            <p style={{ color: "#A1A1AA", fontSize: 14.5, lineHeight: 1.7, margin: "8px 0 0" }}>
              {t.verdict}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}

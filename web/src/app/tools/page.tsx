import type { Metadata } from "next";
import { TOOLS } from "@/lib/tools";
import { ToolLogo } from "@/components/ToolLogo";

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
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 72px", fontFamily: SANS }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, color: "#FAFAFA", margin: 0 }}>
        Agents burnlog counts
      </h1>
      <p style={{ color: "#71717A", fontSize: 14, lineHeight: 1.65, margin: "12px 0 0", maxWidth: 580 }}>
        Local logs when they exist. Provider usage when they don&apos;t. Tokens only.
      </p>

      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid #18181B", borderRadius: 8, background: "#0C0C0E", padding: "12px 14px" }}>
        <code style={{ fontFamily: MONO, fontSize: 12, color: "#E4E4E7", flex: "1 1 220px" }}>
          <span style={{ color: "#52525B" }}>$ </span>npx @sxnalabs/burnlog
        </code>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#52525B" }}>
          run once · already connected? skip it
        </span>
      </div>

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
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 13, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase", color, margin: 0 }}>
        {title}
      </h2>
      <p style={{ color: "#52525B", fontSize: 12.5, lineHeight: 1.6, margin: "8px 0 14px", maxWidth: 640 }}>
        {note}
      </p>
      <div className="tool-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {tools.map((t) => (
          <a
            key={t.slug}
            href={`/tools/${t.slug}`}
            style={{
              border: "1px solid #18181B",
              borderRadius: 8,
              background: "#0C0C0E",
              padding: 16,
              textDecoration: "none",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <span style={{ width: 34, height: 34, flexShrink: 0, border: "1px solid #27272A", borderRadius: 7, display: "grid", placeItems: "center", color }}>
              <ToolLogo slug={t.slug} size={20} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#FAFAFA" }}>{t.name}</span>
              <span style={{ display: "block", color: "#71717A", fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                {t.method === "log" ? "Reads existing local usage. History included." : "Counts provider usage under burnlog wrap."}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

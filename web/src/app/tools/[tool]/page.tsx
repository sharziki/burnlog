import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TOOLS, getTool } from "@/lib/tools";
import { abs } from "@/lib/seo";

type Props = { params: Promise<{ tool: string }> };

// A fixed set of pages built from a literal — no database, no session. Static
// is the whole point: these are the pages a crawler should get instantly.
export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool } = await params;
  const t = getTool(tool);
  if (!t) return { title: "Not found" };

  return {
    title: t.title,
    description: t.description,
    alternates: { canonical: `/tools/${t.slug}` },
    openGraph: {
      title: `${t.title} · burnlog`,
      description: t.description,
      url: abs(`/tools/${t.slug}`),
      type: "article",
      images: [{ url: abs("/og"), width: 1200, height: 630, alt: "burnlog" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t.title} · burnlog`,
      description: t.description,
      images: [abs("/og")],
    },
  };
}

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

const card = {
  border: "1px solid #18181B",
  borderRadius: 10,
  background: "#0C0C0E",
} as const;

const eyebrow = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#6B7280",
} as const;

const body = { color: "#A1A1AA", fontSize: 15, lineHeight: 1.75, margin: "0 0 14px" } as const;

const codeBlock = {
  fontFamily: MONO,
  fontSize: 12.5,
  color: "#E4E4E7",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 8,
  padding: "11px 14px",
  overflowX: "auto",
} as const;

export default async function ToolPage({ params }: Props) {
  const { tool } = await params;
  const t = getTool(tool);
  if (!t) notFound();

  const others = TOOLS.filter((o) => o.slug !== t.slug);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "56px 24px 72px", fontFamily: SANS }}>
      {/* HowTo describes the steps below it and nothing else. The breadcrumb is
          what puts "burnlog › tools › <name>" under the result instead of a
          bare URL. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: t.title,
            description: t.description,
            totalTime: "PT1M",
            supply: [],
            tool: [{ "@type": "HowToTool", name: "burnlog CLI" }],
            step: t.steps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.name,
              text: s.code ? `${s.text} Command: ${s.code}` : s.text,
              url: abs(`/tools/${t.slug}#step-${i + 1}`),
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "burnlog", item: abs("/") },
              { "@type": "ListItem", position: 2, name: "Tools", item: abs("/tools") },
              { "@type": "ListItem", position: 3, name: t.name, item: abs(`/tools/${t.slug}`) },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />

      <nav style={{ ...eyebrow, marginBottom: 18 }} aria-label="Breadcrumb">
        <a href="/" style={{ color: "#6B7280", textDecoration: "none" }}>
          burnlog
        </a>
        {" / "}
        <a href="/tools" style={{ color: "#6B7280", textDecoration: "none" }}>
          tools
        </a>
        {" / "}
        <span style={{ color: "#A1A1AA" }}>{t.name}</span>
      </nav>

      <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.1, color: "#FAFAFA", margin: 0 }}>
        {t.title}
      </h1>

      <p style={{ ...body, fontSize: 17, margin: "18px 0 0" }}>{t.verdict}</p>

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: t.method === "log" ? "#10B981" : "#D97706",
            border: `1px solid ${t.method === "log" ? "#14301F" : "#3A2A10"}`,
            borderRadius: 999,
            padding: "5px 10px",
          }}
        >
          {t.method === "log" ? "read from local logs" : "counted at the wire"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#3F3F46" }}>
          free · open-source CLI · tokens only
        </span>
      </div>

      <section style={{ marginTop: 40 }}>
        <div style={eyebrow}>how to</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, color: "#FAFAFA", margin: "10px 0 20px" }}>
          Counting {t.name} in under a minute
        </h2>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {t.steps.map((s, i) => (
            <li key={s.name} id={`step-${i + 1}`} style={{ ...card, padding: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#D97706" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA", marginBottom: 8 }}>
                    {s.name}
                  </div>
                  {s.code && (
                    <div style={codeBlock}>
                      <span style={{ color: "#3F3F46" }}>$ </span>
                      {s.code}
                    </div>
                  )}
                  <p style={{ ...body, margin: s.code ? "10px 0 0" : 0 }}>{s.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {t.sections.map((s) => (
        <section key={s.heading} style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, color: "#FAFAFA", margin: "0 0 16px" }}>
            {s.heading}
          </h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 40)} style={body}>
              {p}
            </p>
          ))}
        </section>
      ))}

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, color: "#FAFAFA", margin: "0 0 16px" }}>
          What burnlog can&apos;t see
        </h2>
        <div style={{ ...card, padding: 22, borderColor: "#3A1616" }}>
          {t.limits.map((l) => (
            <div key={l} style={{ display: "flex", gap: 10, padding: "7px 0" }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#EF4444" }}>−</span>
              <span style={{ color: "#A1A1AA", fontSize: 14.5, lineHeight: 1.7 }}>{l}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 40, ...card, padding: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#FAFAFA", margin: 0 }}>
          Put {t.name} on the board
        </h2>
        <p style={{ ...body, marginTop: 12 }}>
          One command. It scans, shows you your numbers, and only then asks for an account.
        </p>
        <div style={{ ...codeBlock, marginBottom: 16 }}>
          <span style={{ color: "#3F3F46" }}>$ </span>npx @sxnalabs/burnlog
        </div>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "11px 20px",
            background: "#D97706",
            color: "#09090B",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: MONO,
            textDecoration: "none",
          }}
        >
          See the leaderboard →
        </a>
      </section>

      <section style={{ marginTop: 40 }}>
        <div style={eyebrow}>other agents</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {others.map((o) => (
            <a
              key={o.slug}
              href={`/tools/${o.slug}`}
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "#A1A1AA",
                border: "1px solid #18181B",
                borderRadius: 6,
                padding: "8px 12px",
                textDecoration: "none",
                background: "#0C0C0E",
              }}
            >
              {o.name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

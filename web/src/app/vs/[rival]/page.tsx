import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMPARISONS, COMPARISON_FACTS_READ, getComparison } from "@/lib/comparisons";
import { abs } from "@/lib/seo";

type Props = { params: Promise<{ rival: string }> };

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ rival: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { rival } = await params;
  const c = getComparison(rival);
  if (!c) return { title: "Not found" };

  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: `/vs/${c.slug}` },
    openGraph: {
      title: `${c.title} · burnlog`,
      description: c.description,
      url: abs(`/vs/${c.slug}`),
      type: "article",
      images: [{ url: abs("/og"), width: 1200, height: 630, alt: "burnlog" }],
    },
  };
}

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';
const card = { border: "1px solid #18181B", borderRadius: 10, background: "#0C0C0E" } as const;
const body = { color: "#A1A1AA", fontSize: 15, lineHeight: 1.75, margin: "0 0 14px" } as const;
const h2 = {
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: -0.8,
  color: "#FAFAFA",
  margin: "0 0 16px",
} as const;

export default async function VsPage({ params }: Props) {
  const { rival } = await params;
  const c = getComparison(rival);
  if (!c) notFound();

  const others = COMPARISONS.filter((o) => o.slug !== c.slug);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "56px 24px 72px", fontFamily: SANS }}>
      <nav
        style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6B7280", marginBottom: 18 }}
        aria-label="Breadcrumb"
      >
        <a href="/" style={{ color: "#6B7280", textDecoration: "none" }}>
          burnlog
        </a>
        {" / "}
        <span style={{ color: "#A1A1AA" }}>vs {c.rival}</span>
      </nav>

      <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.1, color: "#FAFAFA", margin: 0 }}>
        {c.title}
      </h1>

      <div style={{ marginTop: 20 }}>
        {c.verdict.map((p) => (
          <p key={p.slice(0, 40)} style={{ ...body, fontSize: 16.5 }}>
            {p}
          </p>
        ))}
      </div>

      <div style={{ ...card, padding: 20, marginTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6B7280", marginBottom: 10 }}>
          what {c.rival} is
        </div>
        <p style={{ ...body, marginBottom: 10 }}>{c.theirs.what}</p>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#52525B" }}>
          {c.theirs.license} ·{" "}
          <a href={c.theirs.source} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "#D97706", textDecoration: "none" }}>
            {c.theirs.source.replace(/^https?:\/\//, "")}
          </a>
        </div>
      </div>

      <section style={{ marginTop: 44 }}>
        <h2 style={h2}>Side by side</h2>
        {/* Wide tables are the classic phone-layout break: let it scroll in its
            own box rather than pushing the page sideways. */}
        <div style={{ ...card, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                {["", "burnlog", c.rival].map((head, i) => (
                  <th
                    key={head || i}
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "14px 18px",
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: i === 1 ? "#D97706" : "#6B7280",
                      borderBottom: "1px solid #18181B",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.label}>
                  <th
                    scope="row"
                    style={{
                      textAlign: "left",
                      padding: "14px 18px",
                      fontFamily: MONO,
                      fontSize: 11,
                      color: "#71717A",
                      fontWeight: 400,
                      borderBottom: "1px solid #131316",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.label}
                  </th>
                  <td style={{ padding: "14px 18px", fontSize: 14, color: "#E4E4E7", lineHeight: 1.6, borderBottom: "1px solid #131316", verticalAlign: "top" }}>
                    {r.burnlog}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 14, color: "#A1A1AA", lineHeight: 1.6, borderBottom: "1px solid #131316", verticalAlign: "top" }}>
                    {r.rival}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 11, color: "#3F3F46", marginTop: 12 }}>
          {c.rival} facts read from its own README and site on {COMPARISON_FACTS_READ}. If
          something here is out of date,{" "}
          <a href="https://github.com/sharziki/burnlog/issues" target="_blank" rel="noopener noreferrer" style={{ color: "#D97706", textDecoration: "none" }}>
            tell us and it gets fixed
          </a>
          .
        </p>
      </section>

      <section style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }} className="landing-two">
        <div style={{ ...card, padding: 24 }}>
          <h2 style={{ ...h2, fontSize: 18, marginBottom: 14 }}>Use {c.rival} when</h2>
          {c.useThemWhen.map((x) => (
            <div key={x} style={{ display: "flex", gap: 10, padding: "7px 0" }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#71717A" }}>→</span>
              <span style={{ color: "#A1A1AA", fontSize: 14, lineHeight: 1.65 }}>{x}</span>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 24, borderColor: "#3A2A10" }}>
          <h2 style={{ ...h2, fontSize: 18, marginBottom: 14 }}>Use burnlog when</h2>
          {c.useBurnlogWhen.map((x) => (
            <div key={x} style={{ display: "flex", gap: 10, padding: "7px 0" }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#D97706" }}>→</span>
              <span style={{ color: "#A1A1AA", fontSize: 14, lineHeight: 1.65 }}>{x}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 44, ...card, padding: 28 }}>
        <h2 style={{ ...h2, fontSize: 22, marginBottom: 12 }}>Try it in a minute</h2>
        <p style={{ ...body }}>
          It scans, shows you your numbers, and only then asks for an account. Nothing to
          uninstall if you don&apos;t like it.
        </p>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            color: "#E4E4E7",
            background: "#09090B",
            border: "1px solid #18181B",
            borderRadius: 8,
            padding: "11px 14px",
            margin: "0 0 16px",
          }}
        >
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

      {others.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6B7280" }}>
            other comparisons
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {others.map((o) => (
              <a
                key={o.slug}
                href={`/vs/${o.slug}`}
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
                vs {o.rival}
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TOOLS, getTool } from "@/lib/tools";
import { abs } from "@/lib/seo";
import { DocPage } from "@/components/DocPage";

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

export default async function ToolPage({ params }: Props) {
  const { tool } = await params;
  const t = getTool(tool);
  if (!t) notFound();

  const others = TOOLS.filter((o) => o.slug !== t.slug);

  return (
    <DocPage
      title={t.title}
      intro={
        <>
          <p className="m-0">{t.verdict}</p>
          <p className="m-0 mt-4 text-[13px] text-dim">
            {t.method === "log" ? "read from local logs" : "counted at the wire"} · free · open-source CLI · tokens only
          </p>
        </>
      }
    >
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

      {/* The scripts above are the first children, so opt this h2 out of the rule. */}
      <h2 className="mt-0 border-0 pt-0">Counting {t.name} in under a minute</h2>
      <ol className="list-none border-t border-line p-0">
        {t.steps.map((s, i) => (
          <li
            key={s.name}
            id={`step-${i + 1}`}
            className="mt-0 grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-line py-6"
          >
            <span className="font-mono text-[13px] text-dim">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="m-0 text-ink">{s.name}</p>
              {s.code && (
                <pre className="mt-3">
                  <code>
                    <span className="text-faint">$ </span>
                    {s.code}
                  </code>
                </pre>
              )}
              <p className="m-0 mt-3">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {t.sections.map((s) => (
        <Fragment key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </Fragment>
      ))}

      <h2>What burnlog can&apos;t see</h2>
      <ul>
        {t.limits.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h2>Put {t.name} on the board</h2>
      <p>One command. It scans, shows you your numbers, and only then asks for an account.</p>
      <pre>
        <code>
          <span className="text-faint">$ </span>npx @sxnalabs/burnlog
        </code>
      </pre>
      <p>
        <a href="/" className="btn no-underline">
          See the leaderboard →
        </a>
      </p>

      <h2>Other agents</h2>
      <p>
        {others.map((o, i) => (
          <span key={o.slug}>
            {i > 0 && <span className="text-faint"> · </span>}
            <a href={`/tools/${o.slug}`}>{o.name}</a>
          </span>
        ))}
      </p>

      <nav aria-label="Breadcrumb" className="mt-16 text-[13px] text-dim">
        <a href="/" className="text-dim">
          burnlog
        </a>
        {" / "}
        <a href="/tools" className="text-dim">
          tools
        </a>
        {" / "}
        <span className="text-soft">{t.name}</span>
      </nav>
    </DocPage>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMPARISONS, COMPARISON_FACTS_READ, getComparison } from "@/lib/comparisons";
import { abs } from "@/lib/seo";
import { DocPage } from "@/components/DocPage";

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

export default async function VsPage({ params }: Props) {
  const { rival } = await params;
  const c = getComparison(rival);
  if (!c) notFound();

  const others = COMPARISONS.filter((o) => o.slug !== c.slug);

  return (
    <DocPage
      wide
      title={c.title}
      intro={
        <div className="max-w-2xl">
          {c.verdict.map((p, i) => (
            <p key={p.slice(0, 40)} className={i === 0 ? "m-0" : "m-0 mt-4"}>
              {p}
            </p>
          ))}
        </div>
      }
    >
      <div className="max-w-2xl">
        <h2>What {c.rival} is</h2>
        <p className="mt-4">{c.theirs.what}</p>
        <p className="mt-3 text-[13px] text-dim">
          {c.theirs.license} ·{" "}
          <a href={c.theirs.source} target="_blank" rel="noopener noreferrer nofollow">
            {c.theirs.source.replace(/^https?:\/\//, "")}
          </a>
        </p>
      </div>

      <h2>Side by side</h2>
      {/* Wide tables are the classic phone-layout break: let it scroll in its
          own box rather than pushing the page sideways. */}
      <div className="overflow-x-auto">
        <table className="min-w-[560px]">
          <thead>
            <tr>
              {["", "burnlog", c.rival].map((head, i) => (
                <th key={head || i} scope="col" className="whitespace-nowrap">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="whitespace-nowrap py-2.5 align-top font-normal">
                  {r.label}
                </th>
                <td className="text-ink">{r.burnlog}</td>
                <td>{r.rival}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-dim">
        {c.rival} facts read from its own README and site on {COMPARISON_FACTS_READ}. If
        something here is out of date,{" "}
        <a href="https://github.com/sharziki/burnlog/issues" target="_blank" rel="noopener noreferrer">
          tell us and it gets fixed
        </a>
        .
      </p>

      <div className="mt-11 grid gap-10 border-t border-line pt-7 sm:grid-cols-2">
        <div>
          <h2>Use {c.rival} when</h2>
          <ul className="mt-4">
            {c.useThemWhen.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Use burnlog when</h2>
          <ul className="mt-4">
            {c.useBurnlogWhen.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="max-w-2xl">
        <h2 className="mt-11 border-t border-line pt-7">Try it in a minute</h2>
        <p className="mt-4">
          It scans, shows you your numbers, and only then asks for an account. Nothing to
          uninstall if you don&apos;t like it.
        </p>
        <pre>
          <code>
            <span className="text-faint">$ </span>npx @sxnalabs/burnlog
          </code>
        </pre>
        <p className="mt-5">
          <a href="/" className="btn no-underline">
            See the leaderboard →
          </a>
        </p>
      </div>

      {others.length > 0 && (
        <div className="max-w-2xl">
          <h2 className="mt-11 border-t border-line pt-7">Other comparisons</h2>
          <p className="mt-4">
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && <span className="text-faint"> · </span>}
                <a href={`/vs/${o.slug}`}>vs {o.rival}</a>
              </span>
            ))}
          </p>
        </div>
      )}

      <nav aria-label="Breadcrumb" className="mt-16 text-[13px] text-dim">
        <a href="/" className="text-dim">
          burnlog
        </a>
        {" / "}
        <span className="text-soft">vs {c.rival}</span>
      </nav>
    </DocPage>
  );
}

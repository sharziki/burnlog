import type { ReactNode } from "react";

/**
 * The layout for every reading page (privacy, terms, security, agents,
 * comparisons): one column, serif title, calm body. Content inside is plain
 * HTML — h2, p, ul, code, table, a — styled once by `.doc` in globals.css, so
 * pages carry no inline styles of their own.
 */
export function DocPage({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  /** Wider measure for pages built from grids or tables rather than prose. */
  wide?: boolean;
}) {
  return (
    <main className={`mx-auto px-5 pb-28 pt-14 sm:px-8 sm:pt-20 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      {eyebrow && <p className="m-0 text-[13px] text-dim">{eyebrow}</p>}
      <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.02] text-ink sm:text-[52px]">
        {title}
      </h1>
      {intro && <div className="mt-5 text-[17px] leading-relaxed text-soft">{intro}</div>}
      <div className="doc mt-10">{children}</div>
    </main>
  );
}

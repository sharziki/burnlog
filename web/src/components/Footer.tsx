export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[13px] text-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="m-0">
          burnlog, by{" "}
          <a href="https://github.com/sharziki" target="_blank" rel="noopener noreferrer" className="text-soft no-underline hover:text-ink">
            Sharvil Saxena
          </a>{" "}
          at{" "}
          <a href="https://sxnalabs.com" target="_blank" rel="noopener noreferrer" className="text-soft no-underline hover:text-ink">
            SXNA Labs
          </a>
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {(
            [
              ["/agent", "Setup"],
              ["/tools", "Agents"],
              ["/privacy", "Privacy"],
              ["/security", "Security"],
              ["/terms", "Terms"],
              ["https://github.com/sharziki/burnlog", "Source"],
            ] as const
          ).map(([href, label]) => (
            <a key={href} href={href} className="text-dim no-underline transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

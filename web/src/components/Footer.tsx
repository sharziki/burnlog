const FOOTER_MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid #141414",
        padding: "24px 24px 32px",
        marginTop: 80,
        background: "#09090B",
        color: "#52525B",
        fontFamily: FOOTER_MONO,
        fontSize: 11,
        letterSpacing: 0.5,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#71717A" }}>
          a{" "}
          <a
            href="https://sxnalabs.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#D97706", textDecoration: "none" }}
          >
            SXNA Labs
          </a>{" "}
          product
        </span>
        <span style={{ color: "#27272A" }}>·</span>
        <span>
          built by{" "}
          <a
            href="https://github.com/sharziki"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#E4E4E7", textDecoration: "none" }}
          >
            sharvil saxena
          </a>
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <a href="/agent" style={{ color: "#52525B", textDecoration: "none" }}>
          setup
        </a>
        <a href="/tools" style={{ color: "#52525B", textDecoration: "none" }}>
          agents
        </a>
        <a href="/privacy" style={{ color: "#52525B", textDecoration: "none" }}>
          privacy
        </a>
        <a href="/security" style={{ color: "#52525B", textDecoration: "none" }}>
          security
        </a>
        <a href="/terms" style={{ color: "#52525B", textDecoration: "none" }}>
          terms
        </a>
        <a
          href="https://www.npmjs.com/package/@sxnalabs/burnlog"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#52525B", textDecoration: "none" }}
        >
          npm
        </a>
        <a
          href="https://github.com/sharziki/burnlog"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          style={{ color: "#52525B", display: "inline-flex", alignItems: "center" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}

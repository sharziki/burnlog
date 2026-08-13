"use client";

import { useEffect, useRef, useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

type RankRow = { name: string; icon: string; color: string; blurb: string; threshold: string };

export function EmbedClient({
  username,
  ranks,
}: {
  username: string;
  ranks: RankRow[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  // Snippets have to carry an absolute origin, but the server doesn't know
  // which host the page is being served from. Reading window during render
  // would make the server and client disagree, so the origin only exists after
  // mount and the snippet bodies hold a placeholder until then — same markup on
  // both passes, no hydration mismatch, no layout jump.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const path = (style?: string) =>
    `/badge/${username}${style && style !== "default" ? `?style=${style}` : ""}`;
  const badge = (style?: string) => `${origin}${path(style)}`;

  const snippets: [string, string, string][] = origin
    ? [
        ["Markdown", "GitHub README", `[![burnlog](${badge()})](${origin}/u/${username})`],
        ["HTML", "site or portfolio", `<a href="${origin}/u/${username}"><img src="${badge()}" alt="burnlog"></a>`],
        ["Widget", "live card", `<script src="${origin}/widget.js" data-user="${username}"></script>`],
      ]
    : [
        ["Markdown", "for a GitHub README", "…"],
        ["HTML", "for a site or portfolio", "…"],
        ["Widget", "a live card, ~4KB, no dependencies", "…"],
      ];

  // The widget preview runs the real script rather than a mock, so what you see
  // is what your page gets. It mounts inline instead of in an iframe: a srcdoc
  // frame inherits the page's `frame-ancestors 'none'`, so it renders blank in
  // production while working fine locally where no CSP header is set.
  const widgetSlot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const slot = widgetSlot.current;
    if (!slot) return;
    slot.textContent = "";
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.setAttribute("data-user", username);
    slot.appendChild(script);
    return () => {
      slot.textContent = "";
    };
  }, [username]);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard blocked — the text is selectable.
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "44px 24px 80px", fontFamily: SANS, color: "#E4E4E7" }}>
      <div style={eyebrow}>Your badge</div>
      <h1 style={{ margin: "10px 0 0", fontSize: 34, letterSpacing: -1.2, lineHeight: 1.05, color: "#FAFAFA" }}>
        Share @{username}&apos;s burn.
      </h1>
      <p style={{ margin: "10px 0 0", color: "#71717A", fontSize: 13.5, lineHeight: 1.6 }}>
        Locked to your account. Updates every 15 minutes.
      </p>

      {/* Live previews — the real endpoint, not a mock. */}
      <div style={{ ...card, marginTop: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={path()} alt="Your burnlog badge" height={20} />
        <button onClick={() => copy("Markdown", snippets[0][2])} style={{ ...copyBtn, marginLeft: "auto", background: "#D97706", borderColor: "#D97706", color: "#09090B", fontWeight: 700 }}>
          {copied === "Markdown" ? "copied" : "copy for README"}
        </button>
      </div>

      <details style={{ ...card, marginTop: 12 }}>
        <summary style={{ cursor: "pointer", color: "#A1A1AA", fontFamily: MONO, fontSize: 11 }}>
          HTML, widget, and badge styles
        </summary>
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            {["default", "flat", "compact"].map((style) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={style} src={path(style)} alt={`burnlog badge, ${style}`} height={20} />
            ))}
          </div>
          {snippets.map(([label, hint, code]) => (
          <div key={label} style={{ borderTop: "1px solid #18181B", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#FAFAFA", fontWeight: 600 }}>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#52525B" }}>{hint}</span>
              <button onClick={() => copy(label, code)} style={copyBtn}>
                {copied === label ? "copied" : "copy"}
              </button>
            </div>
            <code style={codeBlock}>{code}</code>
            {label === "Widget" && (
              <div ref={widgetSlot} style={{ marginTop: 12, minHeight: 158 }} />
            )}
          </div>
          ))}
        </div>
      </details>

      {/* The ladder — what's next, not just where you are. */}
      <h2 style={{ ...eyebrow, marginTop: 32 }}>The ranks</h2>
      <div style={{ ...card, marginTop: 12, padding: 0, overflow: "hidden" }}>
        {ranks
          .slice()
          .reverse()
          .map((r, i) => (
            <div
              key={r.name}
              style={{
                display: "grid",
                gridTemplateColumns: "28px minmax(0,1fr) auto",
                gap: 12,
                alignItems: "center",
                padding: "12px 18px",
                borderTop: i === 0 ? "none" : "1px solid #131316",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 15, color: r.color, textAlign: "center" }}>{r.icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#E4E4E7" }}>{r.name}</span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: 10.5, color: "#52525B", marginTop: 2 }}>
                  {r.blurb}
                </span>
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#52525B", whiteSpace: "nowrap" }}>
                {r.threshold}
              </span>
            </div>
          ))}
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  background: "#0C0C0E",
  border: "1px solid #18181B",
  borderRadius: 12,
  padding: 18,
};

const eyebrow: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#D97706",
  margin: 0,
};

const codeBlock: React.CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 11.5,
  color: "#A1A1AA",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "10px 12px",
  overflowX: "auto",
  whiteSpace: "pre",
};

const copyBtn: React.CSSProperties = {
  marginLeft: "auto",
  padding: "5px 10px",
  borderRadius: 5,
  border: "1px solid #27272A",
  background: "transparent",
  color: "#71717A",
  fontFamily: MONO,
  fontSize: 10,
  cursor: "pointer",
};

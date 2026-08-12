"use client";

import { useEffect, useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

type RankRow = { name: string; icon: string; color: string; blurb: string; threshold: string };

export function EmbedClient({
  username,
  ranks,
}: {
  username: string | null;
  ranks: RankRow[];
}) {
  // Signed-out visitors still get a working preview to copy from.
  const [name, setName] = useState(username ?? "sharziki");
  const [copied, setCopied] = useState<string | null>(null);
  // Snippets have to carry an absolute origin, but the server doesn't know
  // which host the page is being served from. Reading window during render
  // would make the server and client disagree, so the origin only exists after
  // mount and the snippet bodies hold a placeholder until then — same markup on
  // both passes, no hydration mismatch, no layout jump.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const path = (style?: string) =>
    `/badge/${name}${style && style !== "default" ? `?style=${style}` : ""}`;
  const badge = (style?: string) => `${origin}${path(style)}`;

  const snippets: [string, string, string][] = origin
    ? [
        ["Markdown", "for a GitHub README", `[![burnlog](${badge()})](${origin}/u/${name})`],
        ["HTML", "for a site or portfolio", `<a href="${origin}/u/${name}"><img src="${badge()}" alt="burnlog"></a>`],
        ["Widget", "a live card, ~4KB, no dependencies", `<script src="${origin}/widget.js" data-user="${name}"></script>`],
      ]
    : [
        ["Markdown", "for a GitHub README", "…"],
        ["HTML", "for a site or portfolio", "…"],
        ["Widget", "a live card, ~4KB, no dependencies", "…"],
      ];

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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px 80px", fontFamily: SANS, color: "#E4E4E7" }}>
      <div style={eyebrow}>Embed</div>
      <h1 style={{ margin: "10px 0 0", fontSize: 38, letterSpacing: -1.4, lineHeight: 1.05, color: "#FAFAFA" }}>
        Put it where people look.
      </h1>
      <p style={{ margin: "12px 0 0", color: "#A1A1AA", fontSize: 15, maxWidth: 540, lineHeight: 1.6 }}>
        The badge updates itself every 15 minutes.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
        <span style={{ ...eyebrow, color: "#52525B" }}>username</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
          style={{
            background: "#09090B",
            border: "1px solid #18181B",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#FAFAFA",
            fontFamily: MONO,
            fontSize: 12.5,
            outline: "none",
            minWidth: 180,
          }}
        />
      </div>

      {/* Live previews — the real endpoint, not a mock. */}
      <div style={{ ...card, marginTop: 20, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        {["default", "flat", "compact"].map((style) => (
          <div key={style} style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={path(style)} alt={`burnlog badge, ${style}`} height={20} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: "#3F3F46", textTransform: "uppercase", letterSpacing: 1 }}>
              {style}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {snippets.map(([label, hint, code]) => (
          <div key={label} style={card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#FAFAFA", fontWeight: 600 }}>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#52525B" }}>{hint}</span>
              <button onClick={() => copy(label, code)} style={copyBtn}>
                {copied === label ? "copied" : "copy"}
              </button>
            </div>
            <code style={codeBlock}>{code}</code>
            {label === "Widget" && origin !== "" && (
              <iframe
                key={name}
                title="Widget preview"
                sandbox="allow-scripts"
                srcDoc={`<body style="margin:0;background:transparent"><script src="${origin}/widget.js" data-user="${name}"></script></body>`}
                style={{ width: "100%", maxWidth: 360, height: 180, border: "none", marginTop: 12 }}
              />
            )}
          </div>
        ))}
      </div>

      {/* The ladder — what's next, not just where you are. */}
      <h2 style={{ ...eyebrow, marginTop: 40 }}>The ranks</h2>
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

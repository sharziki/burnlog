"use client";

import { useState } from "react";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SITE = "https://burnlog.net";

const btn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #27272A",
  background: "#0C0C0E",
  color: "#E4E4E7",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
} as const;

/**
 * The flex. The card is the same image that unfurls when the link is pasted,
 * so what you see here is exactly what your timeline sees.
 */
export function ShareCard({
  username,
  tokens,
  place,
  own,
}: {
  username: string;
  /** Pre-formatted, e.g. "152.8B". */
  tokens: string;
  place: number | null;
  own: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);
  const url = `${SITE}/u/${username}`;
  const card = `/og/u/${username}`;
  const standing = place ? ` #${place} on burnlog.` : " on burnlog.";
  const text = own
    ? `I've burned ${tokens} tokens shipping with AI.${standing}`
    : `@${username} has burned ${tokens} tokens shipping with AI.${standing}`;

  async function copy(kind: "link" | "badge") {
    const value = kind === "link" ? url : `[![burnlog](${SITE}/badge/${username})](${url})`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", value);
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <a href={card} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        <img
          src={card}
          alt={`${username}'s burnlog card`}
          width={1200}
          height={630}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 12, border: "1px solid #27272A" }}
        />
      </a>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btn, background: "#D97706", borderColor: "#D97706", color: "#09090B", fontWeight: 700 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </a>
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={btn}
        >
          LinkedIn
        </a>
        <button type="button" onClick={() => copy("link")} style={btn}>
          {copied === "link" ? "✓ Copied" : "Copy link"}
        </button>
        <a href={card} download={`burnlog-${username}.png`} style={btn}>
          Download card
        </a>
        {own && (
          <button type="button" onClick={() => copy("badge")} style={btn}>
            {copied === "badge" ? "✓ Copied" : "README badge"}
          </button>
        )}
      </div>
    </section>
  );
}

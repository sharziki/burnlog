"use client";

import { useState } from "react";
import { Check, Code, Download, Link as LinkIcon } from "lucide-react";

const SITE = "https://burnlog.net";

const btn =
  "inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-soft no-underline transition-colors hover:text-ink";

/**
 * Share controls for the public profile. The link unfurls the OG card.
 */
export function ShareCard({
  username,
  tokens,
  place,
}: {
  username: string;
  /** Pre-formatted, e.g. "152.8B". */
  tokens: string;
  place: number | null;
}) {
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);
  const url = `${SITE}/u/${username}`;
  const card = `/og/u/${username}`;
  const standing = place ? ` #${place} on burnlog.` : " on burnlog.";
  const text = `@${username} has burned ${tokens} tokens shipping with AI.${standing}`;

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
    <section aria-label="Share profile" className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <button type="button" onClick={() => copy("link")} className="btn btn-primary">
        {copied === "link" ? <Check className="size-4" /> : <LinkIcon className="size-4" />}
        {copied === "link" ? "Link copied" : "Copy profile link"}
      </button>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={btn}>
          LinkedIn
        </a>
        <a href={card} download={`burnlog-${username}.png`} className={btn}>
          <Download className="size-3.5" aria-hidden /> Download image
        </a>
        <button type="button" onClick={() => copy("badge")} className={btn}>
          {copied === "badge" ? <Check className="size-3.5 text-accent" /> : <Code className="size-3.5" />}
          {copied === "badge" ? "Copied" : "README badge"}
        </button>
      </div>
    </section>
  );
}

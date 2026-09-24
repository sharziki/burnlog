"use client";

import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import { Check, Code, Download, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SITE = "https://burnlog.net";

const btn =
  "inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-soft no-underline transition-colors hover:text-ink";

/**
 * The flex. The card is the same image that unfurls when the link is pasted,
 * so what you see here is exactly what your timeline sees.
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
  const own = useMe()?.username === username;
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
    <section className="mb-8">
      <a
        href={card}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl border border-line"
      >
        <img src={card} alt={`${username}'s burnlog card`} width={1200} height={630} className="block h-auto w-full" />
      </a>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-bg no-underline transition-[filter] hover:brightness-110"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={btn}>
          LinkedIn
        </a>
        <button type="button" onClick={() => copy("link")} className={btn}>
          {copied === "link" ? <Check className="size-3.5 text-accent" /> : <LinkIcon className="size-3.5" />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        <a href={card} download={`burnlog-${username}.png`} className={btn}>
          <Download className="size-3.5" aria-hidden /> Download card
        </a>
        {own && (
          <button type="button" onClick={() => copy("badge")} className={btn}>
            {copied === "badge" ? <Check className="size-3.5 text-accent" /> : <Code className="size-3.5" />}
            {copied === "badge" ? "Copied" : "README badge"}
          </button>
        )}
      </div>
    </section>
  );
}

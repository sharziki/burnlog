"use client";

import { useEffect, useRef, useState } from "react";

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
    <main className="mx-auto max-w-2xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20">
      <p className="m-0 text-[13px] text-dim">Your badge</p>
      <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.02] text-ink sm:text-[52px]">
        Share @{username}&apos;s burn.
      </h1>
      <p className="m-0 mt-5 text-[17px] leading-relaxed text-soft">
        Locked to your account. Updates every 15 minutes.
      </p>

      {/* Live previews — the real endpoint, not a mock. */}
      <div className="mt-10 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={path()} alt="Your burnlog badge" height={20} />
        <button onClick={() => copy("Markdown", snippets[0][2])} className="btn btn-primary ml-auto">
          {copied === "Markdown" ? "copied" : "copy for README"}
        </button>
      </div>

      <details className="mt-8 border-t border-line pt-6">
        <summary className="cursor-pointer text-[13px] font-medium text-soft hover:text-ink">
          HTML, widget, and badge styles
        </summary>
        <div className="mt-6 grid gap-8">
          <div className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface p-5">
            {["default", "flat", "compact"].map((style) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={style} src={path(style)} alt={`burnlog badge, ${style}`} height={20} />
            ))}
          </div>
          {snippets.map(([label, hint, code]) => (
          <div key={label}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[14px] font-medium text-ink">{label}</span>
              <span className="text-[13px] text-dim">{hint}</span>
              <button onClick={() => copy(label, code)} className="btn ml-auto h-8 px-3 text-[13px]">
                {copied === label ? "copied" : "copy"}
              </button>
            </div>
            <pre className="m-0 overflow-x-auto whitespace-pre rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-soft">
              <code>{code}</code>
            </pre>
            {label === "Widget" && (
              <div ref={widgetSlot} className="mt-4 min-h-[158px] rounded-lg border border-line bg-surface p-5" />
            )}
          </div>
          ))}
        </div>
      </details>

      {/* The ladder — what's next, not just where you are. */}
      <section className="mt-8 border-t border-line pt-8">
        <h2 className="m-0 text-[13px] font-medium text-soft">The ranks</h2>
        <ol className="m-0 mt-5 list-none p-0">
          {ranks
            .slice()
            .reverse()
            .map((r) => (
              <li
                key={r.name}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 first:border-t"
              >
                <span className="text-center font-mono text-[15px]" style={{ color: r.color }}>{r.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] text-ink">{r.name}</span>
                  <span className="mt-0.5 block text-[13px] text-dim">{r.blurb}</span>
                </span>
                <span className="whitespace-nowrap font-mono text-[12px] text-dim">{r.threshold}</span>
              </li>
            ))}
        </ol>
      </section>
    </main>
  );
}

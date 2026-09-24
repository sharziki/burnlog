"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard button whose icon draws a check on success. Ported from
 * 21st.dev "Copy Button" (ddoemonn) — same idle / copied / error states and
 * textarea fallback — with CSS stroke-dash drawing instead of Motion.
 *
 * `getValue` may be async: the setup prompt mints a one-time code first.
 */
export function CopyButton({
  getValue,
  label,
  copiedLabel = "Copied",
  className,
}: {
  getValue: () => string | Promise<string>;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "copied" | "error">("idle");

  useEffect(() => {
    if (status !== "copied" && status !== "error") return;
    const t = setTimeout(() => setStatus("idle"), 2400);
    return () => clearTimeout(t);
  }, [status]);

  async function copy() {
    setStatus("busy");
    const text = await getValue();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
    }
    setStatus(ok ? "copied" : "error");
  }

  const done = status === "copied";
  return (
    <button
      type="button"
      onClick={copy}
      disabled={status === "busy"}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-accent px-5 text-[14px] font-medium text-bg transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-wait",
        className,
      )}
    >
      <span className="relative grid size-4" aria-hidden>
        <svg
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("col-start-1 row-start-1 size-4 transition-opacity duration-200", done ? "opacity-0" : "opacity-100")}
        >
          <path d="M9.6 5.1V3.7A1.7 1.7 0 0 0 7.9 2H3.7A1.7 1.7 0 0 0 2 3.7v4.2a1.7 1.7 0 0 0 1.7 1.7h1.4" />
          <rect x="5.1" y="5.1" width="6.9" height="6.9" rx="1.7" />
        </svg>
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="col-start-1 row-start-1 size-4">
          <path
            d="M2.9 7.4 5.6 10.1 11.1 4"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={done ? 0 : 1}
            className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
          />
        </svg>
      </span>
      <span>{done ? copiedLabel : status === "error" ? "Clipboard blocked" : status === "busy" ? "Preparing…" : label}</span>
      <span role="status" aria-live="polite" className="sr-only">
        {done ? copiedLabel : ""}
      </span>
    </button>
  );
}

"use client";

import { useState } from "react";
import { ToolLogo } from "@/components/ToolLogo";
import { cn } from "@/lib/utils";

const AGENTS = [
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["gemini-cli", "Gemini CLI"],
  ["copilot", "Copilot"],
  ["opencode", "opencode"],
] as const;

/**
 * The agents the prompt works in, as a row of their marks. Adapted from the
 * inline layout of 21st.dev "Open In Chat" (8starlabs): same bordered strip of
 * icon buttons with tooltips. Web chat apps can't run a command on your
 * machine, so the marks are the coding agents that can, and a click copies the
 * prompt for that agent instead of opening a URL.
 *
 * Without `getPrompt` it's a static "works in" row for signed-out visitors.
 */
export function AgentRow({ getPrompt }: { getPrompt?: () => Promise<string> }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function pick(name: string) {
    if (!getPrompt) return;
    const text = await getPrompt();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(name);
      setTimeout(() => setCopied(null), 2600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex h-11 w-fit items-center gap-1 rounded-lg border border-line px-2.5">
        <span className="pr-1.5 text-[13px] text-dim">{getPrompt ? "Paste into" : "Works in"}</span>
        {AGENTS.map(([slug, name]) => {
          const inner = (
            <>
              <span className="grayscale transition group-hover:grayscale-0 group-focus-visible:grayscale-0 [&_svg]:opacity-60 group-hover:[&_svg]:opacity-100">
                <ToolLogo slug={slug} size={17} wordmark={false} />
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {getPrompt ? `Copy for ${name}` : name}
              </span>
            </>
          );
          const cls = "group relative inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-ink/[0.06]";
          return getPrompt ? (
            <button key={slug} type="button" aria-label={`Copy prompt for ${name}`} onClick={() => pick(name)} className={cn(cls, "cursor-pointer border-0 bg-transparent")}>
              {inner}
            </button>
          ) : (
            <span key={slug} className={cls} aria-label={name}>
              {inner}
            </span>
          );
        })}
        <span className="pl-1.5 text-[13px] text-faint">+50</span>
      </div>
      <span role="status" aria-live="polite" className={cn("text-[13px] text-soft transition-opacity", copied ? "opacity-100" : "opacity-0")}>
        {copied ? `Copied — paste it into ${copied}.` : " "}
      </span>
    </div>
  );
}

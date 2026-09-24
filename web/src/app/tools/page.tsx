import type { Metadata } from "next";
import { TOOLS } from "@/lib/tools";
import { ToolLogo } from "@/components/ToolLogo";

export const metadata: Metadata = {
  title: "Which AI coding agents burnlog tracks",
  description:
    "Claude Code, Codex, Cursor, Gemini CLI, aider, opencode — how burnlog counts each one, whether it reads local logs or counts at the wire, and what it can't see.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  const logs = TOOLS.filter((t) => t.method === "log");
  const wire = TOOLS.filter((t) => t.method === "wrap");

  return (
    <main className="mx-auto max-w-5xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20">
      <h1 className="m-0 font-display text-[40px] leading-[1.02] text-ink sm:text-[52px]">
        Agents burnlog counts
      </h1>
      <p className="m-0 mt-5 max-w-[34rem] text-[17px] leading-relaxed text-soft">
        Local logs when they exist. Provider usage when they don&apos;t. Tokens only.
      </p>

      <p className="m-0 mt-8 text-[13px] text-dim">
        <code className="font-mono text-soft">
          <span className="text-faint">$ </span>npx @sxnalabs/burnlog
        </code>
        <span className="ml-3">run once · already connected? skip it</span>
      </p>

      <Group
        title="Read from local logs"
        note="The agent already writes its own usage to disk. Nothing to configure, and your first run counts history you already have."
        tools={logs}
      />
      <Group
        title="Counted at the wire"
        note="No readable log, so burnlog reads the usage field off the API response instead — the provider's own number, not an estimate."
        tools={wire}
      />
    </main>
  );
}

function Group({ title, note, tools }: { title: string; note: string; tools: typeof TOOLS }) {
  return (
    <section className="mt-16">
      <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="m-0 mt-2 max-w-[40rem] text-[14px] leading-relaxed text-soft">{note}</p>
      <ul className="m-0 mt-6 grid list-none grid-cols-1 border-t border-line p-0 sm:grid-cols-2 sm:gap-x-10">
        {tools.map((t) => (
          <li key={t.slug} className="border-b border-line">
            <a
              href={`/tools/${t.slug}`}
              className="group grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 py-5 no-underline"
            >
              <span className="mt-0.5 opacity-60 grayscale transition-opacity group-hover:opacity-100">
                <ToolLogo slug={t.slug} size={18} wordmark={false} />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] text-ink">{t.name}</span>
                  <span className="shrink-0 text-[12px] text-dim">
                    {t.method === "log" ? "reads directly" : "via wrap"}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[14px] leading-relaxed text-soft">
                  {t.verdict}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

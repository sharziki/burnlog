import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getBoard } from "@/lib/stats";
import { Leaderboard, type BoardRow } from "@/components/Leaderboard";
import { SetupCTA } from "@/components/SetupCTA";
import { YouCard } from "@/components/YouCard";
import { RetroGrid } from "@/components/ui/retro-grid";
import { NumberTicker } from "@/components/ui/number-ticker";

// Static, refreshed every 30s. Who's looking is resolved in the browser, so
// every visitor gets the cached page from the edge instead of a fresh render.
export const revalidate = 30;

// The canonical matters: burnlog.net is reachable as three Vercel aliases.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const users = await getBoard();
  const rows: BoardRow[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    image: u.image,
    avatar: u.avatar,
    totalTokens: u.totalTokens,
    weeklyTokens: u.weeklyTokens,
    streak: u.streak,
    weeklyHistory: u.weeklyHistory,
  }));
  const burners = rows.filter((r) => r.totalTokens > 0);
  const total = burners.reduce((s, r) => s + r.totalTokens, 0);
  const week = burners.reduce((s, r) => s + r.weeklyTokens, 0);

  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_50%_60%_at_50%_-10%,rgba(245,158,11,0.22),transparent)]"
      />
      <section className="relative overflow-hidden">
        <RetroGrid />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <a
            href="#board"
            className="animate-rise group mx-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-linear-to-tr from-zinc-300/5 via-amber/10 to-transparent px-4 py-1.5 font-mono text-xs text-soft no-underline"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
            <span className="ml-1.5">{burners.length} burners · live</span>
            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>

          <h1 className="animate-rise mx-auto mt-6 max-w-3xl bg-[linear-gradient(180deg,#FFF_0%,rgba(255,255,255,0.55)_130%)] bg-clip-text text-5xl font-bold leading-[1.02] tracking-tighter text-transparent [animation-delay:60ms] sm:text-7xl">
            How hard do you{" "}
            <span className="bg-linear-to-r from-amber via-flame to-amber bg-clip-text text-transparent">
              ship with AI?
            </span>
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-xl text-base leading-relaxed text-soft [animation-delay:120ms] sm:text-lg">
            Paste one prompt into your coding agent. It links this machine to your account, counts every token
            you&apos;ve burned, and puts you on the board.
          </p>

          <div className="animate-rise mt-10 [animation-delay:180ms]">
            <SetupCTA />
          </div>

          <YouCard rows={rows} />
        </div>
      </section>

      <div className="relative mx-auto max-w-4xl px-4 pb-24">
        <dl className="animate-rise mb-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {(
            [
              ["Burned", total],
              ["This week", week],
              ["Burners", burners.length],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="bg-surface px-4 py-5 text-center sm:px-6">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</dt>
              <dd className="m-0 mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink sm:text-3xl">
                {label === "Burners" ? v : <NumberTicker value={v} />}
              </dd>
            </div>
          ))}
        </dl>

        <Leaderboard rows={rows} />

        <p className="mt-8 text-center font-mono text-xs text-dim">
          Token counts only — never prompts, code, or file names.{" "}
          <a href="/privacy" className="text-soft underline decoration-faint underline-offset-4 hover:text-ink">
            What we store
          </a>
        </p>
      </div>
    </main>
  );
}

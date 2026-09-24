"use client";

import { useState } from "react";
import { Crown, Flame } from "lucide-react";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useMe";

export type BoardRow = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  avatar: string;
  totalTokens: number;
  weeklyTokens: number;
  streak: number;
  weeklyHistory: number[];
};

const CROWN = ["text-amber", "text-zinc-300", "text-orange-700"];

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 96;
  const h = 24;
  const max = Math.max(...data, 1);
  if (data.every((v) => v === 0)) {
    return <div className="h-px w-24 border-t border-dashed border-faint" />;
  }
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Adapted from 21st.dev "Leaderboard Rankings" (trophyso): crowned top three, highlighted self. */
export function Leaderboard({ rows }: { rows: BoardRow[] }) {
  const me = useMe();
  const [weekly, setWeekly] = useState(false);
  const value = (r: BoardRow) => (weekly ? r.weeklyTokens : r.totalTokens);
  const ranked = rows.filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));

  return (
    <section id="board" className="animate-rise [animation-delay:200ms]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.25em] text-dim">Leaderboard</h2>
        <div className="flex rounded-full border border-line bg-surface p-1">
          {([false, true] as const).map((w) => (
            <button
              key={String(w)}
              type="button"
              onClick={() => setWeekly(w)}
              className={cn(
                "cursor-pointer rounded-full border-0 px-3.5 py-1.5 font-mono text-xs transition-colors",
                weekly === w ? "bg-amber/15 text-amber" : "bg-transparent text-dim hover:text-soft",
              )}
            >
              {w ? "This week" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <div role="list" className="overflow-hidden rounded-2xl border border-line bg-surface/80 backdrop-blur">
        {ranked.length === 0 && (
          <div className="px-6 py-12 text-center font-mono text-sm text-dim">
            Nobody has burned anything {weekly ? "this week" : "yet"}. Be first.
          </div>
        )}
        {ranked.map((r, i) => {
          const rank = getRank(r.totalTokens);
          const mine = me?.username === r.username;
          return (
            <a
              key={r.id}
              role="listitem"
              href={`/u/${r.username}`}
              className={cn(
                "group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-4 py-3 text-inherit no-underline transition-colors first:border-t-0 hover:bg-white/[0.025] sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_7rem_9rem] sm:px-5",
                mine && "bg-amber/[0.06] shadow-[inset_3px_0_0_var(--color-amber)]",
              )}
            >
              <span className="flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-soft">
                {i + 1}
                {i < 3 && <Crown className={cn("size-4", CROWN[i])} aria-hidden />}
              </span>

              <span className="flex min-w-0 items-center gap-3">
                {r.image ? (
                  <img
                    src={r.image}
                    alt=""
                    width={40}
                    height={40}
                    loading={i < 8 ? "eager" : "lazy"}
                    className="size-10 shrink-0 rounded-full object-cover ring-2"
                    style={{ ["--tw-ring-color" as string]: `${rank.color}55` }}
                  />
                ) : (
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
                    style={{ background: `${rank.color}22`, color: rank.color }}
                  >
                    {r.avatar}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {r.name}
                    {mine && (
                      <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 align-middle font-mono text-[10px] text-amber">
                        you
                      </span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-xs text-dim">
                    @{r.username}
                    {r.streak >= 7 && (
                      <span className="text-ember">
                        {" "}
                        · <Flame className="inline size-3 -translate-y-px" aria-hidden /> {r.streak}d
                      </span>
                    )}
                  </span>
                </span>
              </span>

              <span className="hidden sm:block">
                <Spark data={r.weeklyHistory} color={rank.color} />
              </span>

              <span className="text-right font-mono text-base font-semibold tabular-nums text-ink">
                {formatTokens(value(r))}
              </span>

              <span
                className="hidden justify-self-end whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold sm:inline-block"
                style={{ color: rank.color, borderColor: `${rank.color}40`, background: `${rank.color}12` }}
              >
                {rank.icon} {rank.name}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

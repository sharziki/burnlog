"use client";

import { ArrowUpRight, Flame } from "lucide-react";
import { getRank } from "@/lib/ranks";
import { useMe } from "@/hooks/useMe";
import { NumberTicker } from "@/components/ui/number-ticker";
import type { BoardRow } from "@/components/Leaderboard";

/** Your standing, pulled from the same board the page already has — no extra request. */
export function YouCard({ rows }: { rows: BoardRow[] }) {
  const me = useMe();
  if (!me) return null;

  const burners = rows.filter((r) => r.totalTokens > 0).sort((a, b) => b.totalTokens - a.totalTokens);
  const place = burners.findIndex((r) => r.username === me.username) + 1;
  const row = place ? burners[place - 1] : null;

  if (!row) {
    return (
      <div className="animate-rise mx-auto mt-10 max-w-xl rounded-2xl border border-line bg-surface/80 px-5 py-4 text-center font-mono text-sm text-soft backdrop-blur">
        Signed in as <span className="text-ink">@{me.username}</span>. Paste the prompt into your agent and your
        numbers land here.
      </div>
    );
  }

  const rank = getRank(row.totalTokens);
  return (
    <a
      href={`/u/${me.username}`}
      className="animate-rise group mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-px overflow-hidden rounded-2xl border border-amber/25 bg-line text-inherit no-underline shadow-[0_0_60px_-20px_rgba(245,158,11,0.35)] sm:grid-cols-4"
    >
      <div className="col-span-3 flex items-center gap-3 bg-surface px-5 py-4 sm:col-span-1">
        {me.image && <img src={me.image} alt="" width={36} height={36} className="size-9 rounded-full" />}
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-dim">you</div>
          <div className="truncate text-sm font-semibold text-ink">@{me.username}</div>
        </div>
        <ArrowUpRight className="ml-auto size-4 text-dim transition-colors group-hover:text-amber" aria-hidden />
      </div>
      <Stat label="Rank">
        <span className="text-amber">#{place}</span>
        <span className="ml-1 text-sm text-dim">/ {burners.length}</span>
      </Stat>
      <Stat label="Burned">
        <NumberTicker value={row.totalTokens} />
      </Stat>
      <Stat label={rank.name}>
        <span className="inline-flex items-center gap-1">
          <Flame className="size-4 text-ember" aria-hidden />
          {row.streak}d
        </span>
      </Stat>
    </a>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-3 py-4 sm:px-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{children}</div>
    </div>
  );
}

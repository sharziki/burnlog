"use client";

import { useState } from "react";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useMe";
import { SegmentedControl } from "@/components/ui/segmented-control";

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

function Spark({ data, hot }: { data: number[]; hot: boolean }) {
  const w = 64;
  const h = 18;
  const max = Math.max(...data, 1);
  if (data.every((v) => v === 0)) return <span className="block h-px w-16 bg-line" />;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 1 - (v / max) * (h - 2)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={hot ? "var(--color-accent)" : "var(--color-faint)"}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The board: one table, hairline rows, numbers in mono. */
export function Leaderboard({ rows }: { rows: BoardRow[] }) {
  const me = useMe();
  const [range, setRange] = useState<"all" | "week">("all");
  const value = (r: BoardRow) => (range === "week" ? r.weeklyTokens : r.totalTokens);
  const ranked = rows.filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));

  return (
    <section id="board" aria-label="Leaderboard" className="scroll-mt-24">
      <div className="flex items-center justify-between gap-4 pb-4">
        <h2 className="m-0 text-[13px] font-medium text-soft">Leaderboard</h2>
        <SegmentedControl
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: "all", label: "All time" },
            { value: "week", label: "This week" },
          ]}
        />
      </div>

      <ol className="m-0 list-none border-t border-line p-0">
        {ranked.length === 0 && (
          <li className="py-10 text-center text-sm text-dim">Nobody has burned anything {range === "week" ? "this week" : "yet"}.</li>
        )}
        {ranked.map((r, i) => {
          const mine = me?.username === r.username;
          return (
            <li key={r.id} className="border-b border-line">
              <a
                href={`/u/${r.username}`}
                className={cn(
                  "group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 px-2 py-3.5 text-inherit no-underline transition-colors hover:bg-ink/[0.025] sm:grid-cols-[2rem_minmax(0,1fr)_4rem_7rem]",
                  mine && "bg-ink/[0.035]",
                )}
              >
                <span className={cn("font-mono text-[13px] tabular-nums", i === 0 ? "text-accent" : "text-dim")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt=""
                      width={28}
                      height={28}
                      loading={i < 10 ? "eager" : "lazy"}
                      className="size-7 shrink-0 rounded-full object-cover grayscale-[35%] transition group-hover:grayscale-0"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] font-mono text-[10px] text-soft">
                      {r.avatar}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-[15px] text-ink">
                    {r.name}
                    <span className="ml-2 font-mono text-[12px] text-dim">@{r.username}</span>
                    {mine && <span className="ml-2 text-[12px] text-accent">you</span>}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <Spark data={r.weeklyHistory} hot={i === 0} />
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[15px] tabular-nums text-ink">{formatTokens(value(r))}</span>
                  <span className="block text-[11px] text-dim">{getRank(r.totalTokens).name}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

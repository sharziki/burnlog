"use client";

import { useState } from "react";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
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

const FIRST = 10;
const STEP = 25;

function Spark({ data, hot }: { data: number[]; hot: boolean }) {
  const w = 64;
  const h = 18;
  const max = Math.max(...data, 1);
  if (data.every((v) => v === 0)) return <span className="block h-px w-16 bg-line" />;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 1 - (v / max) * (h - 2)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={hot ? "var(--color-accent)" : "var(--color-faint)"} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ r, place, value }: { r: BoardRow; place: number; value: number }) {
  return (
    <li className="border-b border-line">
      <a
        href={`/u/${r.username}`}
        className="group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 px-2 py-3.5 text-inherit no-underline transition-colors hover:bg-ink/[0.025] sm:grid-cols-[2.75rem_minmax(0,1fr)_4rem_7rem]"
      >
        <span className={cn("font-mono text-[13px] tabular-nums", place === 1 ? "text-accent" : "text-dim")}>
          {String(place).padStart(2, "0")}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          {r.image ? (
            <img src={r.image} alt="" width={28} height={28} loading={place <= FIRST ? "eager" : "lazy"} className="size-7 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] font-mono text-[10px] text-soft">{r.avatar}</span>
          )}
          <span className="min-w-0 truncate text-[15px] text-ink">
            {r.name}
            <span className="ml-2 font-mono text-[12px] text-dim">@{r.username}</span>
          </span>
        </span>
        <span className="hidden sm:block">
          <Spark data={r.weeklyHistory} hot={place === 1} />
        </span>
        <span className="text-right">
          <span className="block font-mono text-[15px] tabular-nums text-ink">{formatTokens(value)}</span>
          <span className="block text-[11px] text-dim">{getRank(r.totalTokens).name}</span>
        </span>
      </a>
    </li>
  );
}

/**
 * The board. Shows the top ten and grows 25 at a time.
 */
export function Leaderboard({ rows, burners }: { rows: BoardRow[]; burners: number }) {
  const [range, setRange] = useState<"all" | "week">("all");
  const [shown, setShown] = useState(FIRST);

  const value = (r: BoardRow) => (range === "week" ? r.weeklyTokens : r.totalTokens);
  const ranked = rows.filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));
  const visible = ranked.slice(0, shown);
  const more = Math.min(STEP, ranked.length - shown);

  return (
    <section id="board" aria-label="Leaderboard" className="scroll-mt-24">
      <div className="flex items-center justify-between gap-4 pb-4">
        <h2 className="m-0 text-[13px] font-medium text-soft">
          Leaderboard <span className="ml-1 font-mono text-dim">{burners.toLocaleString()}</span>
        </h2>
        <SegmentedControl
          label="Time range"
          value={range}
          onChange={(v) => {
            setRange(v);
            setShown(FIRST);
          }}
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
        {visible.map((r, i) => (
          <Row key={r.id} r={r} place={i + 1} value={value(r)} />
        ))}
      </ol>

      {more <= 0 && ranked.length > 0 && burners > ranked.length && (
        <p className="m-0 mt-4 text-center text-[13px] text-dim">
          Top {ranked.length} of {burners.toLocaleString()}
        </p>
      )}

      {more > 0 && (
        <button type="button" onClick={() => setShown((s) => s + STEP)} className="btn mt-4 w-full">
          Show {more} more
        </button>
      )}

    </section>
  );
}

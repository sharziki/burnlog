import type { Metadata } from "next";
import { getBoard } from "@/lib/stats";
import { formatTokens } from "@/lib/format";
import { Leaderboard, type BoardRow } from "@/components/Leaderboard";
import { SetupCTA } from "@/components/SetupCTA";

// Static, refreshed every 30s. Who's looking is resolved in the browser, so
// every visitor gets the cached page from the edge instead of a fresh render.
export const revalidate = 30;

// The canonical matters: burnlog.net is reachable as three Vercel aliases.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** The leaderboard is the home page; setup stays one action away. */
export default async function Home() {
  // A build with no reachable database (CI) renders an empty board rather than
  // failing; the 30s revalidation fills it in on the first live request.
  const users = await getBoard().catch(() => []);
  const toRow = (u: (typeof users)[number]): BoardRow => ({
    id: u.id,
    username: u.username,
    name: u.name,
    image: u.image,
    avatar: u.avatar,
    totalTokens: u.totalTokens,
    weeklyTokens: u.weeklyTokens,
    streak: u.streak,
    weeklyHistory: u.weeklyHistory,
  });
  const burners = users.filter((u) => u.totalTokens > 0);
  const total = burners.reduce((s, u) => s + u.totalTokens, 0);
  const week = burners.reduce((s, u) => s + u.weeklyTokens, 0);
  // Ship the top of the board, not all of it: the 100 biggest all-time and the
  // 100 biggest this week. The page stays the same size at any board size;
  // your own row, if it's further down, comes from /api/me/standing.
  const TOP = 100;
  const byWeek = [...burners].sort((a, b) => b.weeklyTokens - a.weeklyTokens).slice(0, TOP);
  const rows = [...new Map([...burners.slice(0, TOP), ...byWeek].map((u) => [u.id, toRow(u)])).values()];

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <div className="flex flex-col gap-8 border-b border-line pb-9 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="m-0 font-display text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.05] text-ink">
            Every token you burn, ranked.
          </h1>
          <p className="m-0 mt-3 max-w-2xl text-[15px] leading-[1.6] text-soft">
            The public leaderboard for AI coding tokens. Counts only — never prompts or code.
          </p>
        </div>
        <div className="shrink-0">
          <SetupCTA />
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-12">
        <div>
          <Leaderboard rows={rows} burners={burners.length} />
        </div>
        <aside className="border-t border-line pt-5 lg:pt-0" aria-label="Board totals">
          <p className="m-0 text-[12px] font-medium text-dim">Across the board</p>
          <dl className="m-0 mt-4 grid grid-cols-3 gap-5 lg:grid-cols-1 lg:gap-6">
            {(
              [
                ["Burned", formatTokens(total)],
                ["This week", formatTokens(week)],
                ["Burners", burners.length.toLocaleString()],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <dt className="text-[12px] text-dim">{label}</dt>
                <dd className="m-0 mt-1 font-mono text-[18px] tabular-nums text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { getBoard } from "@/lib/stats";
import { formatTokens } from "@/lib/format";
import { Leaderboard, type BoardRow } from "@/components/Leaderboard";
import { SetupCTA } from "@/components/SetupCTA";
import { YouLine } from "@/components/YouLine";

// Static, refreshed every 30s. Who's looking is resolved in the browser, so
// every visitor gets the cached page from the edge instead of a fresh render.
export const revalidate = 30;

// The canonical matters: burnlog.net is reachable as three Vercel aliases.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * One screen: what it is and the one action on the left, the board itself on
 * the right. The board is the product, so it is the hero.
 */
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
    <main className="mx-auto grid max-w-6xl gap-14 px-5 pb-28 pt-14 sm:px-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 md:pt-16 lg:gap-20 lg:pt-20">
      <div className="animate-rise md:sticky md:top-24 md:self-start">
        <h1 className="m-0 max-w-[12ch] font-display text-[40px] leading-[1.02] text-ink md:text-[40px] lg:text-[48px]">
          Every token you burn, ranked.
        </h1>
        <p className="m-0 mt-5 max-w-[27rem] text-[15.5px] leading-[1.6] text-soft">
          Paste one prompt into your coding agent. It links your machine, counts every token since your first
          session, and keeps you on the board. Counts only — never prompts or code.
        </p>

        <div className="mt-8">
          <SetupCTA />
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <YouLine />
          <dl className="m-0 mt-5 grid grid-cols-3 gap-6">
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
        </div>
      </div>

      <div className="animate-rise [animation-delay:80ms]">
        <Leaderboard rows={rows} burners={burners.length} />
      </div>
    </main>
  );
}

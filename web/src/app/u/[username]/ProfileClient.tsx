import { Globe } from "lucide-react";
import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { ACHIEVEMENTS, TIER_COLOR } from "@/lib/achievements";
import { ShareCard } from "@/components/ShareCard";
import { GithubIcon } from "@/components/ui/github-icon";
import { sourceLabel } from "@/lib/sources";
import { cn } from "@/lib/utils";
import type { UserStats } from "@/lib/stats";

// The challenge trophies stay in the ledger but not on the shelf: there are no
// challenges to win on the site any more.
const SHOWN = ACHIEVEMENTS.filter((a) => a.key !== "duelist" && a.key !== "champion");

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** "a", "a and b", "a, b and c" — a list that reads as prose. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** 1st, 2nd, 3rd, 11th — the teens are the exception every naive version gets wrong. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function Panel({ title, aside, className, children }: { title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-dim">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Heatmap({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(...heatmap, 1);
  return (
    <div className="grid grid-flow-col grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-7 gap-1">
      {heatmap.map((v, i) => (
        <div
          key={i}
          title={`${formatTokens(v)} tokens`}
          className="aspect-square rounded-[4px]"
          style={{ background: v > 0 ? `rgba(245,158,11,${(0.14 + 0.86 * Math.sqrt(v / max)).toFixed(2)})` : "#141417" }}
        />
      ))}
    </div>
  );
}

function Bars({ items }: { items: { label: string; tokens: number }[] }) {
  if (!items.length) return <div className="font-mono text-xs text-faint">No data yet</div>;
  const total = items.reduce((s, x) => s + x.tokens, 0) || 1;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((x) => {
        const pct = Math.round((x.tokens / total) * 100);
        return (
          <li key={x.label} className="font-mono text-xs">
            <div className="mb-1.5 flex justify-between gap-3">
              <span className="truncate text-ink">{x.label}</span>
              <span className="shrink-0 text-dim">
                {formatTokens(x.tokens)} · {pct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-linear-to-r from-ember to-amber" style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfileClient({
  user,
  joinedAt,
  achievements,
  place = null,
  neighbours = [],
}: {
  user: UserStats;
  joinedAt: string;
  achievements: string[];
  /** Position on the global board, 1-indexed. Null if they aren't on it. */
  place?: number | null;
  /** The burners immediately above and below, for context and for crawl paths. */
  neighbours?: { place: number; username: string; name: string; image: string | null; totalTokens: number }[];
}) {
  const unlocked = new Set(achievements);
  const rank = getRank(user.totalTokens);
  const next = RANKS.find((r) => r.min > user.totalTokens) ?? null;
  const progress = next ? Math.min(100, ((user.totalTokens - rank.min) / (next.min - rank.min)) * 100) : 100;
  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{ background: `radial-gradient(ellipse 55% 60% at 50% -10%, ${rank.color}33, transparent)` }}
      />
      <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-12">
        {/* ─── Header ─── */}
        <header className="animate-rise flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.username}
              width={88}
              height={88}
              className="size-[88px] rounded-2xl object-cover ring-2 ring-offset-4 ring-offset-bg"
              style={{ ["--tw-ring-color" as string]: rank.color }}
            />
          ) : (
            <div
              className="flex size-[88px] items-center justify-center rounded-2xl font-mono text-3xl font-bold"
              style={{ background: `${rank.color}22`, color: rank.color }}
            >
              {user.avatar}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{user.name}</h1>
              <span
                className="rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold"
                style={{ color: rank.color, borderColor: `${rank.color}45`, background: `${rank.color}14` }}
              >
                {rank.icon} {rank.name}
              </span>
              {place ? (
                <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber">
                  #{place} on the board
                </span>
              ) : null}
            </div>
            <div className="mt-1 font-mono text-sm text-dim">@{user.username}</div>
            {user.bio && <p className="m-0 mt-2.5 max-w-2xl text-[15px] leading-relaxed text-soft">{user.bio}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-dim">
              {user.github && (
                <a href={`https://github.com/${user.github}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-soft no-underline hover:text-ink">
                  <GithubIcon className="size-3.5" /> {user.github}
                </a>
              )}
              {user.twitter && (
                <a href={`https://x.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="text-soft no-underline hover:text-ink">
                  𝕏 @{user.twitter}
                </a>
              )}
              {user.website && (
                <a
                  href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-soft no-underline hover:text-ink"
                >
                  <Globe className="size-3.5" aria-hidden /> {user.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span>joined {joinDate}</span>
              <span>active {relativeTime(user.lastActive)}</span>
            </div>
          </div>
        </header>

        {/* ─── Next rank ─── */}
        {next && (
          <div className="animate-rise mt-8 [animation-delay:60ms]">
            <div className="mb-2 flex justify-between font-mono text-xs">
              <span style={{ color: rank.color }}>{rank.name}</span>
              <span className="text-dim">
                {formatTokens(next.min - user.totalTokens)} to <span style={{ color: next.color }}>{next.name}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(progress, 2)}%`, background: `linear-gradient(90deg, ${rank.color}, ${next.color})` }}
              />
            </div>
          </div>
        )}

        {/* ─── The card ─── */}
        <div className="animate-rise mt-8 [animation-delay:120ms]">
          <ShareCard username={user.username} tokens={formatTokens(user.totalTokens)} place={place} />
        </div>

        {/* ─── Summary ───
            Every number here is a chart or a tile, which a search engine reads
            as an empty page. This is the same data as a sentence. */}
        <p className="m-0 mb-6 max-w-3xl text-[15px] leading-7 text-soft">
          <strong className="font-semibold text-ink">@{user.username}</strong> has burned{" "}
          <strong className="font-semibold text-ink">{formatTokens(user.totalTokens)} tokens</strong> across{" "}
          {user.commits.toLocaleString()} session{user.commits === 1 ? "" : "s"} of AI coding
          {user.sources.length > 0 && <> with {joinNames(user.sources.slice(0, 3).map((x) => sourceLabel(x.source)))}</>}, rank{" "}
          <strong className="font-semibold" style={{ color: rank.color }}>
            {rank.name}
          </strong>
          {place ? <> and {ordinal(place)} on the global board</> : null}.
          {user.streak > 0 && <> {user.streak}-day streak{user.longestStreak > user.streak ? `, ${user.longestStreak} at best` : ""}.</>}{" "}
          Tokens only — burnlog never sees prompts, code, or file names.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="12-week activity" aside={<span className="font-mono text-xs text-dim">{formatTokens(user.weeklyTokens)} this week</span>}>
            <Heatmap heatmap={user.heatmap} />
          </Panel>
          <Panel title="Agents">
            <Bars items={user.sources.map((s) => ({ label: sourceLabel(s.source), tokens: s.tokens }))} />
          </Panel>
          <Panel title="Top models" className="md:col-span-2">
            <Bars items={user.topModels.map((m) => ({ label: m.model, tokens: m.tokens }))} />
          </Panel>
        </div>

        {neighbours.length > 0 && (
          <Panel title="Nearby on the board" className="mt-4">
            <div className="flex flex-wrap gap-2">
              {neighbours.map((n) => (
                <a
                  key={n.username}
                  href={`/u/${n.username}`}
                  className="flex items-center gap-2 rounded-full border border-line bg-bg py-1 pl-1 pr-3 font-mono text-xs text-ink no-underline transition-colors hover:border-amber/40"
                >
                  {n.image ? <img src={n.image} alt="" width={22} height={22} className="size-[22px] rounded-full" /> : null}
                  <span className="text-dim">#{n.place}</span> @{n.username}
                  <span className="text-dim">{formatTokens(n.totalTokens)}</span>
                </a>
              ))}
            </div>
          </Panel>
        )}

        <Panel
          title="Achievements"
          aside={
            <span className="font-mono text-xs text-dim">
              {SHOWN.filter((a) => unlocked.has(a.key)).length} / {SHOWN.length}
            </span>
          }
          className="mt-4"
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {SHOWN.map((a) => {
              const earned = unlocked.has(a.key);
              const color = TIER_COLOR[a.tier];
              return (
                <div
                  key={a.key}
                  title={earned ? a.name : `Locked — ${a.how}`}
                  className={cn("rounded-xl border px-3 py-2.5 transition-transform", earned ? "hover:-translate-y-0.5" : "border-line opacity-45")}
                  style={earned ? { borderColor: `${color}45`, background: `${color}0F` } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm" style={{ color: earned ? color : "#3F3F46" }}>
                      {a.icon}
                    </span>
                    <span className={cn("text-xs font-semibold", earned ? "text-ink" : "text-dim")}>{a.name}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] leading-snug text-dim">{earned ? a.tier : a.how}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </main>
  );
}

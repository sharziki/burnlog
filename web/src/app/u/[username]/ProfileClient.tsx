import { RANKS, getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { ShareCard } from "@/components/ShareCard";
import { GithubIcon } from "@/components/ui/github-icon";
import { sourceLabel } from "@/lib/sources";
import type { UserStats } from "@/lib/stats";

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

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="m-0 text-[13px] font-medium text-soft">{title}</h2>
        {aside && <span className="text-[12px] text-dim">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Heatmap({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(...heatmap, 1);
  return (
    <div className="grid w-full max-w-[360px] grid-flow-col grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-7 gap-[3px]">
      {heatmap.map((v, i) => (
        <div
          key={i}
          title={`${formatTokens(v)} tokens`}
          className="aspect-square rounded-[2px]"
          style={{
            // Ivory for activity; orange is saved for the single heaviest day.
            background:
              v === max && v > 0
                ? "var(--color-accent)"
                : v > 0
                  ? `rgba(237,234,227,${(0.12 + 0.6 * Math.sqrt(v / max)).toFixed(2)})`
                  : "rgba(237,234,227,0.05)",
          }}
        />
      ))}
    </div>
  );
}

function Rows({ items }: { items: { label: string; tokens: number }[] }) {
  if (!items.length) return <p className="m-0 text-[13px] text-dim">Nothing yet.</p>;
  const total = items.reduce((s, x) => s + x.tokens, 0) || 1;
  return (
    <ul className="m-0 list-none p-0">
      {items.map((x) => {
        const pct = (x.tokens / total) * 100;
        return (
          <li key={x.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2">
            <span className="truncate text-[14px] text-ink">{x.label}</span>
            <span className="font-mono text-[13px] tabular-nums text-soft">
              {formatTokens(x.tokens)} <span className="text-dim">{Math.round(pct)}%</span>
            </span>
            <span className="col-span-2 mt-1.5 block h-px bg-line">
              <span className="block h-px bg-ink/60" style={{ width: `${Math.max(pct, 0.5)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfileClient({
  user,
  joinedAt,
  place = null,
  neighbours = [],
}: {
  user: UserStats;
  joinedAt: string;
  /** Position on the global board, 1-indexed. Null if they aren't on it. */
  place?: number | null;
  /** The burners immediately above and below, for context and for crawl paths. */
  neighbours?: { place: number; username: string; name: string; image: string | null; totalTokens: number }[];
}) {
  const rank = getRank(user.totalTokens);
  const next = RANKS.find((r) => r.min > user.totalTokens) ?? null;
  const progress = next ? Math.min(100, ((user.totalTokens - rank.min) / (next.min - rank.min)) * 100) : 100;
  const joinDate = new Date(joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      {/* ─── Who ─── */}
      <header className="animate-rise flex items-start gap-4 sm:gap-5">
        {user.image ? (
          <img src={user.image} alt="" width={56} height={56} className="size-12 shrink-0 rounded-full object-cover sm:size-14" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] font-mono text-lg text-soft sm:size-14">
            {user.avatar}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="m-0 break-words font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.1] text-ink">
            {user.name}
          </h1>
          <p className="m-0 mt-2.5 text-[14px] text-soft">
            <span className="font-mono text-dim">@{user.username}</span>
            <span className="text-faint"> · </span>
            {rank.name}
            {place ? (
              <>
                <span className="text-faint"> · </span>
                <span className={place === 1 ? "text-accent" : "text-ink"}>#{place}</span> on the board
              </>
            ) : null}
          </p>
          {user.bio && <p className="m-0 mt-3 max-w-xl text-[15px] leading-relaxed text-soft">{user.bio}</p>}
          <p className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-dim">
            {user.github && (
              <a href={`https://github.com/${user.github}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-soft no-underline hover:text-ink">
                <GithubIcon className="size-3.5" /> {user.github}
              </a>
            )}
            {user.twitter && (
              <a href={`https://x.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="text-soft no-underline hover:text-ink">
                x.com/{user.twitter}
              </a>
            )}
            {user.website && (
              <a
                href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-soft no-underline hover:text-ink"
              >
                {user.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span>joined {joinDate}</span>
            {user.lastActive && <span>active {relativeTime(user.lastActive)}</span>}
          </p>
        </div>
      </header>

      {/* ─── The numbers ─── */}
      <div className="mt-7 border-t border-line pt-5">
        <ShareCard username={user.username} tokens={formatTokens(user.totalTokens)} place={place} />
      </div>

      <dl className="animate-rise m-0 mt-8 grid grid-cols-2 gap-6 border-y border-line py-8 [animation-delay:60ms] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <dt className="text-[13px] text-soft">Total tokens</dt>
          <dd className="m-0 mt-2 font-mono text-[clamp(2rem,6vw,4rem)] leading-none tabular-nums tracking-tight text-ink">{formatTokens(user.totalTokens)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-soft">This week</dt>
          <dd className="m-0 mt-2 font-mono text-[clamp(2rem,6vw,4rem)] leading-none tabular-nums tracking-tight text-ink">{formatTokens(user.weeklyTokens)}</dd>
        </div>
      </dl>

      {next && (
        <div className="mt-5">
          <div className="h-px w-full bg-line">
            <div className="h-px bg-accent" style={{ width: `${Math.max(progress, 1)}%` }} />
          </div>
          <p className="m-0 mt-2.5 text-[12px] text-dim">
            {formatTokens(next.min - user.totalTokens)} to {next.name}
          </p>
        </div>
      )}

      {/* Every number above is a tile or a chart, which a search engine reads as
          an empty page. This is the same data as a sentence. */}
      <p className="m-0 mb-4 mt-8 text-[14px] leading-6 text-soft">
        @{user.username} has burned {formatTokens(user.totalTokens)} tokens across {user.commits.toLocaleString()} session
        {user.commits === 1 ? "" : "s"} of AI coding
        {user.sources.length > 0 && <> with {joinNames(user.sources.slice(0, 3).map((x) => sourceLabel(x.source)))}</>}, rank{" "}
        {rank.name}
        {place ? <>, {ordinal(place)} on the global board</> : null}.
      </p>

      <Section title="Last 12 weeks">
        <Heatmap heatmap={user.heatmap} />
      </Section>

      <div className="grid gap-x-12 sm:grid-cols-2">
        <Section title="Agents">
          <Rows items={user.sources.map((s) => ({ label: sourceLabel(s.source), tokens: s.tokens }))} />
        </Section>
        <Section title="Models">
          <Rows items={user.topModels.map((m) => ({ label: m.model, tokens: m.tokens }))} />
        </Section>
      </div>

      {neighbours.length > 0 && (
        <Section title="Nearby on the board">
          <ul className="m-0 list-none p-0">
            {neighbours.map((n) => (
              <li key={n.username}>
                <a
                  href={`/u/${n.username}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-inherit no-underline hover:text-ink"
                >
                  <span className="font-mono text-[13px] text-dim">{String(n.place).padStart(2, "0")}</span>
                  <span className="truncate text-[14px] text-ink">
                    {n.name} <span className="font-mono text-[12px] text-dim">@{n.username}</span>
                  </span>
                  <span className="font-mono text-[13px] tabular-nums text-soft">{formatTokens(n.totalTokens)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

    </main>
  );
}

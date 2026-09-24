"use client";

import { formatTokens } from "@/lib/format";
import { useMe } from "@/hooks/useMe";
import type { BoardRow } from "@/components/Leaderboard";

/** Your standing in one sentence, from the board the page already has. */
export function YouLine({ rows }: { rows: BoardRow[] }) {
  const me = useMe();
  if (!me) return null;

  const burners = rows.filter((r) => r.totalTokens > 0).sort((a, b) => b.totalTokens - a.totalTokens);
  const place = burners.findIndex((r) => r.username === me.username) + 1;
  const row = place ? burners[place - 1] : null;

  return (
    <p className="m-0 text-[14px] leading-relaxed text-soft">
      {row ? (
        <>
          You&apos;re <span className="text-ink">#{place}</span> of {burners.length} with{" "}
          <span className="font-mono text-ink">{formatTokens(row.totalTokens)}</span> tokens
          {row.streak > 1 ? <>, {row.streak} days running</> : null}.{" "}
        </>
      ) : (
        <>Signed in as @{me.username}. Paste the prompt and you&apos;ll appear here. </>
      )}
      <a href={`/u/${me.username}`} className="text-ink underline decoration-faint underline-offset-4 hover:decoration-ink">
        Your profile
      </a>
    </p>
  );
}

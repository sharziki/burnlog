"use client";

import { formatTokens } from "@/lib/format";
import { useMe } from "@/hooks/useMe";
import { useStanding } from "@/hooks/useStanding";
import { Skeleton } from "@/components/ui/skeleton";

/** Your standing in one sentence — from the server, so it holds past the top 100. */
export function YouLine() {
  const me = useMe();
  const s = useStanding();
  if (me === undefined) return <Skeleton className="h-4 w-72" />;
  if (!me) return null;
  if (!s) return <Skeleton className="h-4 w-72" />;

  return (
    <p className="m-0 text-[14px] leading-relaxed text-soft">
      {s?.row && s.place ? (
        <>
          You&apos;re <span className="text-ink">#{s.place}</span> of {s.total.toLocaleString()} with{" "}
          <span className="font-mono text-ink">{formatTokens(s.row.totalTokens)}</span> tokens
          {s.row.streak > 1 ? <>, {s.row.streak} days running</> : null}.{" "}
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

"use client";

import { GithubIcon } from "@/components/ui/github-icon";
import { Settings } from "lucide-react";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { useMe } from "@/hooks/useMe";
import { signInWithGitHub } from "@/app/actions";

/**
 * Client-side so no page has to read the session on the server: that one
 * lookup was forcing every page, the board included, to render per request.
 */
export function Nav() {
  const me = useMe();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="/" className="no-underline">
          <Logo size={28} />
        </a>

        <nav className="flex items-center gap-2">
          <a
            href="/#board"
            className="hidden rounded-full px-3 py-1.5 font-mono text-xs text-soft no-underline transition-colors hover:bg-white/5 hover:text-ink sm:inline-block"
          >
            leaderboard
          </a>
          {me === undefined ? (
            <span className="h-9 w-24" aria-hidden />
          ) : me ? (
            <>
              <NotificationBell />
              <a
                href={`/u/${me.username}`}
                className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 font-mono text-xs text-ink no-underline transition-colors hover:border-amber/40"
              >
                {me.image ? (
                  <img src={me.image} alt="" width={26} height={26} className="size-[26px] rounded-full" />
                ) : null}
                @{me.username}
              </a>
              <a
                href="/settings"
                aria-label="Settings"
                className="flex size-9 items-center justify-center rounded-full border border-line text-dim no-underline transition-colors hover:text-ink"
              >
                <Settings className="size-4" aria-hidden />
              </a>
            </>
          ) : (
            <form action={signInWithGitHub}>
              <button
                type="submit"
                className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 font-mono text-xs text-ink transition-colors hover:border-amber/40"
              >
                <GithubIcon className="size-3.5" aria-hidden /> Sign in
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}

"use client";

import { Settings } from "lucide-react";
import { BurnMark } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { useMe } from "@/hooks/useMe";
import { signInWithGitHub } from "@/app/actions";

/**
 * Client-side so no page reads the session on the server — that lookup forced
 * every page, the board included, to render per request.
 */
export function Nav() {
  const me = useMe();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2 text-ink no-underline">
          <BurnMark size={20} ground="#0B0B0A" />
          <span className="text-[15px] font-semibold tracking-tight">burnlog</span>
        </a>

        <nav className="flex items-center gap-4 text-[13px] sm:gap-6">
          <a href="/" className="text-soft no-underline transition-colors hover:text-ink">
            Leaderboard
          </a>
          {me === undefined ? (
            <span className="h-7 w-16" aria-hidden />
          ) : me ? (
            <span className="flex items-center gap-4">
              <a href={`/u/${me.username}`} className="flex items-center gap-2 text-ink no-underline" title={`@${me.username}`}>
                <span className="hidden sm:inline">My profile</span>
                {me.image ? (
                  <img src={me.image} alt="My profile" width={26} height={26} className="size-[26px] rounded-full" />
                ) : (
                  <span className="sm:hidden">Profile</span>
                )}
              </a>
              <NotificationBell />
              <a href="/settings" aria-label="Settings" className="text-dim no-underline transition-colors hover:text-ink">
                <Settings className="size-4" aria-hidden />
              </a>
            </span>
          ) : (
            <form action={signInWithGitHub}>
              <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-ink hover:text-accent">
                Sign in
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}

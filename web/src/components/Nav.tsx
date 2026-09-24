import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { BurnMark } from "./Logo";

/** Public navigation stays complete in the first HTML response. */
export async function Nav() {
  // Presence is enough for nav copy; /me validates the session before showing
  // private controls. Avoid a browser request and a DB lookup on public pages.
  const signedIn = (await cookies()).getAll().some((cookie) =>
    /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(cookie.name),
  );

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
          {signedIn ? (
            <a href="/me" className="text-ink no-underline transition-colors hover:text-accent">My profile</a>
          ) : (
            <form action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/me" });
            }}>
              <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-ink hover:text-accent">Log in</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}

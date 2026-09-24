import type { Metadata } from "next";
import Link from "next/link";

/**
 * The page a failed GitHub sign-in lands on.
 *
 * Without it, Auth.js falls back to its own stock error page: an unstyled
 * white card that says "Configuration" under a raw HTTP 500. That is what
 * every ordinary failure looked like — declining the GitHub consent screen,
 * an expired code, GitHub being briefly unreachable — none of which is the
 * visitor's fault and none of which is a 500 as far as they are concerned.
 *
 * Auth.js only exposes four error slugs here, and only `AccessDenied` and
 * `Verification` mean anything specific; the rest arrive as `Configuration`
 * whether the cause was our config or a transient handshake failure. So the
 * copy stays honest about that instead of guessing: say what is known, offer
 * the retry, and name the one thing that is worth reporting.
 */

export const metadata: Metadata = {
  title: "Sign-in problem · burnlog",
  description: "Something went wrong signing in to burnlog with GitHub.",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  AccessDenied: {
    title: "Sign-in was cancelled",
    body: "GitHub didn't hand burnlog an account — usually because the authorization screen was declined. Nothing was created, and nothing was sent anywhere.",
  },
  Verification: {
    title: "That link has expired",
    body: "Sign-in links are single-use and short-lived. Start again and it'll work.",
  },
  Configuration: {
    title: "GitHub sign-in didn't complete",
    body: "The handshake with GitHub failed on the way back. That's usually momentary — trying again is the fix. If it happens twice in a row, it's on our side and worth reporting.",
  },
};

const FALLBACK = MESSAGES.Configuration;

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { title, body } = (error && MESSAGES[error]) || FALLBACK;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <p className="m-0 text-[13px] text-dim">Sign in</p>

      <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.05] text-ink">
        {title}
      </h1>

      <p className="m-0 mt-4 text-[15px] leading-relaxed text-soft">{body}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Try again
        </Link>
        <a
          href="https://github.com/sharziki/burnlog/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
        >
          Report it
        </a>
      </div>

      {/* The slug is the only thing that makes a report actionable, so it's on
          the page rather than only in the query string. */}
      {error && <p className="m-0 mt-8 font-mono text-[12px] text-faint">reference: {error}</p>}
    </main>
  );
}

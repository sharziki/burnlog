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

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

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
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10, color: "#52525B", letterSpacing: 2, textTransform: "uppercase" }}>
        burnlog · sign in
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: "#FAFAFA", margin: 0 }}>
        {title}
      </h1>

      <p style={{ fontSize: 14, color: "#71717A", lineHeight: 1.65, margin: 0, maxWidth: 440 }}>
        {body}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <Link
          href="/"
          style={{
            padding: "12px 22px",
            background: "#D97706",
            color: "#09090B",
            border: "none",
            borderRadius: 8,
            fontFamily: MONO,
            fontSize: 12.5,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Try again
        </Link>
        <a
          href="https://github.com/sharziki/burnlog/issues"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "12px 20px",
            border: "1px solid #27272A",
            borderRadius: 8,
            fontFamily: MONO,
            fontSize: 12.5,
            color: "#A1A1AA",
            textDecoration: "none",
          }}
        >
          Report it
        </a>
      </div>

      {/* The slug is the only thing that makes a report actionable, so it's on
          the page rather than only in the query string. */}
      {error && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#3F3F46" }}>
          reference: {error}
        </div>
      )}
    </div>
  );
}

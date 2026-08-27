import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

/**
 * The branded stand-in for Auth.js's own sign-in screen.
 *
 * Auth.js renders a provider picker at /api/auth/signin, and several places in
 * the app link straight to it with a `callbackUrl` so the visitor lands back
 * where they were. That page is unstyled stock markup, and with exactly one
 * provider there is nothing on it to pick — it is a white interstitial between
 * a burnlog page and GitHub. This replaces it: same contract (`callbackUrl` in,
 * same destination out), one button, and the site's own chrome around it.
 *
 * Already signed in? Then this page has no job, so it forwards immediately
 * rather than offering to sign in a second time.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · burnlog",
  description: "Sign in to burnlog with GitHub.",
  robots: { index: false, follow: false },
};

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Only same-site paths are honoured. `callbackUrl` arrives in a query string
 * anyone can write, so an absolute URL — or a protocol-relative `//evil.com`,
 * which `startsWith("/")` alone would wave through — is discarded rather than
 * turned into an open redirect wearing burnlog's sign-in page.
 */
function safeCallback(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = safeCallback(callbackUrl);

  const session = await auth();
  if ((session?.user as { id?: string } | undefined)?.id) redirect(redirectTo);

  async function signInAction() {
    "use server";
    await signIn("github", { redirectTo });
  }

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
        Sign in with GitHub
      </h1>

      <p style={{ fontSize: 14, color: "#71717A", lineHeight: 1.65, margin: 0, maxWidth: 400 }}>
        burnlog reads your GitHub username, name, and avatar to put you on the board.
        It never asks for repository access.
      </p>

      <form action={signInAction} style={{ marginTop: 6 }}>
        <button
          type="submit"
          className="btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "13px 22px",
            background: "#D97706",
            color: "#09090B",
            border: "none",
            borderRadius: 8,
            fontFamily: MONO,
            fontSize: 12.5,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          Sign in with GitHub
        </button>
      </form>

      <a href="/" style={{ fontFamily: MONO, fontSize: 11.5, color: "#52525B", textDecoration: "none" }}>
        ← back to the board
      </a>
    </div>
  );
}

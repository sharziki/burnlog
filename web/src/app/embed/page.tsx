import type { Metadata } from "next";
import { auth, signIn } from "@/auth";
import { RANKS } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { EmbedClient } from "./EmbedClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "README badge and embeddable widget",
  description:
    "An SVG badge that updates itself and a dependency-free widget under 4KB. Put your AI token rank on a GitHub README, a portfolio, or a docs site.",
  alternates: { canonical: "/embed" },
};

/**
 * The embed surface, and the home of the full rank ladder.
 *
 * The ladder used to live in a board tab that was removed as duplication. It
 * wasn't — a rank chip tells you where you are, the ladder tells you what's
 * next, and that's the part that makes ranks pull. It belongs next to the
 * badge, since both answer "what does my rank look like to other people".
 */
export default async function EmbedPage() {
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)?.username ?? null;

  if (!username) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "72px 24px 96px", textAlign: "center" }}>
        <div style={{ fontFamily: 'var(--font-mono), "IBM Plex Mono", monospace', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#D97706" }}>
          Your badge
        </div>
        <h1 style={{ margin: "12px 0 10px", fontSize: 34, letterSpacing: -1.2, color: "#FAFAFA" }}>
          Share your burn.
        </h1>
        <p style={{ margin: "0 auto 24px", color: "#71717A", fontSize: 14, lineHeight: 1.6 }}>
          Sign in so burnlog can use your account. No username field. No pretending to be someone else.
        </p>
        <form action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/embed" });
        }}>
          <button type="submit" style={{ minHeight: 42, padding: "10px 18px", border: 0, borderRadius: 7, background: "#D97706", color: "#09090B", fontFamily: 'var(--font-mono), "IBM Plex Mono", monospace', fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Sign in with GitHub
          </button>
        </form>
      </main>
    );
  }

  return (
    <EmbedClient
      username={username}
      ranks={RANKS.map((r) => ({
        name: r.name,
        icon: r.icon,
        color: r.color,
        blurb: r.blurb,
        threshold: r.min === 0 ? "0" : `${formatTokens(r.min)}+`,
      }))}
    />
  );
}

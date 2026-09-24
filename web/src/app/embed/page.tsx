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
      <main className="mx-auto max-w-xl px-5 pb-24 pt-16 text-center sm:px-8 sm:pt-24">
        <p className="m-0 text-[13px] text-dim">Your badge</p>
        <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.02] text-ink sm:text-[52px]">
          Share your burn.
        </h1>
        <p className="m-0 mx-auto mb-8 mt-5 max-w-md text-[16px] leading-relaxed text-soft">
          Sign in so burnlog can use your account. No username field. No pretending to be someone else.
        </p>
        <form action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/embed" });
        }}>
          <button type="submit" className="btn btn-primary">
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

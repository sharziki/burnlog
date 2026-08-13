import type { Metadata } from "next";
import { auth } from "@/auth";
import { RANKS } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { EmbedClient } from "./EmbedClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "embed",
  description: "Put your burn on your README, your site, or anywhere else people look at your work.",
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

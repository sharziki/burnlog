import type { Metadata } from "next";
import { auth } from "@/auth";
import { CHALLENGE_TYPES, getOpenChallenges, getUserChallenges } from "@/lib/challenges";
import { ChallengesClient } from "./ChallengesClient";
import { requireFullSurface } from "@/lib/surface";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "challenges",
  description:
    "Start a token sprint, efficiency gauntlet, or streak race. Share one link and see who actually burns hardest.",
  alternates: { canonical: "/challenges" },
};

export default async function ChallengesPage() {
  requireFullSurface();
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [mine, open] = await Promise.all([
    userId ? getUserChallenges(userId) : Promise.resolve([]),
    getOpenChallenges(),
  ]);
  const mineIds = new Set(mine.map((c) => c.id));

  return (
    <ChallengesClient
      mine={mine}
      open={open.filter((c) => !mineIds.has(c.id))}
      types={CHALLENGE_TYPES}
      signedIn={Boolean(userId)}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getChallenge, formatRemaining } from "@/lib/challenges";
import { ChallengeClient } from "./ChallengeClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const challenge = await getChallenge({ inviteCode: code });
  if (!challenge) return { title: "challenge not found" };

  const leader = challenge.standings[0];
  const state =
    challenge.status === "ended"
      ? challenge.winnerUsername
        ? `Won by @${challenge.winnerUsername}`
        : "Ended"
      : formatRemaining(challenge.msRemaining);
  const description = leader
    ? `${challenge.typeLabel} · ${challenge.standings.length} burning · @${leader.username} leads · ${state}`
    : `${challenge.typeLabel} · ${state}`;

  return {
    title: challenge.name,
    description,
    openGraph: {
      title: `${challenge.name} · burnlog`,
      description,
      images: [`/og/c/${code}`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${challenge.name} · burnlog`,
      description,
      images: [`/og/c/${code}`],
    },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { code } = await params;
  const challenge = await getChallenge({ inviteCode: code });
  if (!challenge) notFound();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  return (
    <ChallengeClient
      initial={challenge}
      signedIn={Boolean(userId)}
      joined={userId ? challenge.standings.some((s) => s.userId === userId) : false}
      meUserId={userId}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnlog.net"}
    />
  );
}

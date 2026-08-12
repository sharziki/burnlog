import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { friendIdsOf } from "@/lib/friends";

export const dynamic = "force-dynamic";

/**
 * Which getting-started steps this user has actually completed.
 *
 * Every step here is *detected*, never self-reported. A checklist you tick
 * yourself is a to-do list; one that notices you finished is what makes the
 * setup feel like it's meeting you halfway. The UI polls this while you're
 * in your terminal so the step completes itself the moment tokens land.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [burn, entries, friends] = await Promise.all([
    prisma.burnEvent.aggregate({
      where: { userId },
      _sum: { totalTokens: true },
      _count: { _all: true },
    }),
    prisma.challengeEntry.count({ where: { userId } }),
    friendIdsOf(userId),
  ]);

  const tokens = burn._sum.totalTokens ?? 0;

  return NextResponse.json({
    ok: true,
    steps: {
      signedIn: true,
      synced: tokens > 0,
      inChallenge: entries > 0,
      hasFriend: friends.length > 0,
    },
    tokens,
    events: burn._count._all,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import {
  CHALLENGE_TYPES,
  challengeType,
  getOpenChallenges,
  getUserChallenges,
  newInviteCode,
  type ChallengeConfig,
  type ChallengeTypeId,
} from "@/lib/challenges";

export const dynamic = "force-dynamic";

/** Free tier ceiling from the spec. Keeps invite-spam bounded too. */
const MAX_ACTIVE_CHALLENGES = 3;
const ALLOWED_PROVIDERS = new Set(["anthropic", "openai", "google", "other"]);

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/**
 * Challenges can be driven from the browser (session cookie) or from the CLI
 * (`burnlog challenge`, bearer API key). Resolve whichever is present.
 */
async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;

  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) return result.key.userId;
  }
  return null;
}

/** Normalise the type-specific settings, clamping anything user-supplied. */
function buildConfig(type: ChallengeTypeId, body: Record<string, unknown>): ChallengeConfig {
  switch (type) {
    case "provider": {
      const p = String(body.provider ?? "anthropic");
      return { provider: ALLOWED_PROVIDERS.has(p) ? p : "anthropic" };
    }
    case "streak": {
      const n = Math.floor(Number(body.targetStreak ?? 7));
      return { targetStreak: Number.isFinite(n) ? Math.min(365, Math.max(2, n)) : 7 };
    }
    case "cost-cap": {
      const n = Math.floor(Number(body.budgetTokens ?? 1_000_000));
      return {
        budgetTokens: Number.isFinite(n) ? Math.min(1e12, Math.max(1_000, n)) : 1_000_000,
      };
    }
    default:
      return {};
  }
}

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to create a challenge");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "bad_json", "request body is not valid json");
  }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > 60) {
    return bad(400, "invalid_name", "Name must be 1-60 characters");
  }

  const typeId = String(body.type ?? "sprint") as ChallengeTypeId;
  const type = CHALLENGE_TYPES.find((t) => t.id === typeId);
  if (!type) return bad(400, "invalid_type", "Unknown challenge type");

  const days = Math.floor(Number(body.days ?? type.durations[0]));
  if (!type.durations.includes(days)) {
    return bad(
      400,
      "invalid_duration",
      `${type.label} runs for ${type.durations.join(", ")} days`,
    );
  }

  const active = await prisma.challenge.count({
    where: { hostId: userId, status: "active", endsAt: { gt: new Date() } },
  });
  if (active >= MAX_ACTIVE_CHALLENGES) {
    return bad(
      403,
      "challenge_limit",
      `You already host ${MAX_ACTIVE_CHALLENGES} active challenges. Let one finish first.`,
    );
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  const config = buildConfig(typeId, body);

  const rematchOfId =
    typeof body.rematchOfId === "string" && body.rematchOfId.length < 64
      ? body.rematchOfId
      : null;

  const challenge = await prisma.$transaction(async (tx) => {
    const c = await tx.challenge.create({
      data: {
        name,
        type: typeId,
        hostId: userId,
        inviteCode: newInviteCode(),
        config: Object.keys(config).length ? JSON.stringify(config) : null,
        startsAt,
        endsAt,
        rematchOfId,
      },
    });
    // The host is always entrant #1 — a challenge of one is still a thing
    // you can share, and it means the standings are never empty.
    await tx.challengeEntry.create({ data: { challengeId: c.id, userId } });

    // A rematch carries the original roster over so nobody has to re-invite.
    if (rematchOfId) {
      const previous = await tx.challengeEntry.findMany({
        where: { challengeId: rematchOfId },
        select: { userId: true },
      });
      const others = previous.filter((p) => p.userId !== userId);
      if (others.length) {
        await tx.challengeEntry.createMany({
          data: others.map((p) => ({ challengeId: c.id, userId: p.userId })),
          skipDuplicates: true,
        });
      }
    }
    return c;
  });

  return NextResponse.json(
    {
      ok: true,
      challenge: {
        id: challenge.id,
        name: challenge.name,
        type: challenge.type,
        inviteCode: challenge.inviteCode,
        url: `/c/${challenge.inviteCode}`,
      },
    },
    { status: 201 },
  );
}

export async function GET(req: Request) {
  const userId = await currentUserId(req);

  const [mine, open] = await Promise.all([
    userId ? getUserChallenges(userId) : Promise.resolve([]),
    getOpenChallenges(),
  ]);

  const mineIds = new Set(mine.map((c) => c.id));
  return NextResponse.json({
    ok: true,
    mine,
    open: open.filter((c) => !mineIds.has(c.id)),
    types: CHALLENGE_TYPES,
    typeLabels: Object.fromEntries(
      CHALLENGE_TYPES.map((t) => [t.id, challengeType(t.id).label]),
    ),
  });
}

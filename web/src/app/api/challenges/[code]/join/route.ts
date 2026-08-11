import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nobody wants to score a 60-way sprint, and it caps invite-link abuse. */
const MAX_ENTRANTS = 50;

/** Browser session or CLI bearer key — both can join a challenge. */
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const userId = await currentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "sign in to join" },
      { status: 401 },
    );
  }

  const challenge = await prisma.challenge.findUnique({
    where: { inviteCode: code },
    select: { id: true, endsAt: true, _count: { select: { entries: true } } },
  });
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "no challenge with that code" },
      { status: 404 },
    );
  }
  if (challenge.endsAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: "ended", message: "this challenge has already ended" },
      { status: 409 },
    );
  }
  if (challenge._count.entries >= MAX_ENTRANTS) {
    return NextResponse.json(
      { ok: false, error: "full", message: `challenges cap at ${MAX_ENTRANTS} entrants` },
      { status: 409 },
    );
  }

  // Joining twice is a no-op, not an error — invite links get clicked twice.
  await prisma.challengeEntry.createMany({
    data: [{ challengeId: challenge.id, userId }],
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, joined: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const userId = await currentUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const challenge = await prisma.challenge.findUnique({
    where: { inviteCode: code },
    select: { id: true, hostId: true },
  });
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (challenge.hostId === userId) {
    return NextResponse.json(
      { ok: false, error: "host_cannot_leave", message: "the host can't leave their own challenge" },
      { status: 409 },
    );
  }

  await prisma.challengeEntry.deleteMany({
    where: { challengeId: challenge.id, userId },
  });
  return NextResponse.json({ ok: true, joined: false });
}

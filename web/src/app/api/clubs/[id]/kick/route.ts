import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (club.ownerId !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden", message: "Only the team owner can kick members" }, { status: 403 });
  }

  const body = (await req.json()) as { userId?: string };
  const targetId = body.userId;
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  if (targetId === userId) {
    return NextResponse.json({ ok: false, error: "cannot_kick_self" }, { status: 400 });
  }

  const membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: id, userId: targetId } },
  });
  if (!membership) {
    return NextResponse.json({ ok: false, error: "not_member" }, { status: 400 });
  }

  await prisma.clubMembership.delete({
    where: { clubId_userId: { clubId: id, userId: targetId } },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id, msgId } = await params;

  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const msg = await prisma.clubAnnouncement.findUnique({ where: { id: msgId } });
  if (!msg || msg.clubId !== id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const isAdmin = club.ownerId === userId;
  const isAuthor = msg.authorId === userId;
  if (!isAdmin && !isAuthor) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  await prisma.clubAnnouncement.delete({ where: { id: msgId } });
  return NextResponse.json({ ok: true });
}

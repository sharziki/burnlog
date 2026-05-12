import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  const announcements = await prisma.clubAnnouncement.findMany({
    where: {
      clubId: id,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    include: {
      author: { select: { id: true, username: true, name: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json({ ok: true, announcements });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const isMember = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: id, userId } },
  });
  if (!isMember) {
    return NextResponse.json({ ok: false, error: "not_member" }, { status: 403 });
  }

  const body = (await req.json()) as { content?: string };
  const content = (body.content ?? "").trim();
  if (!content || content.length > 500) {
    return NextResponse.json(
      { ok: false, error: "invalid_content", message: "Content must be 1-500 characters" },
      { status: 400 },
    );
  }

  const announcement = await prisma.clubAnnouncement.create({
    data: { clubId: id, authorId: userId, content },
    include: {
      author: { select: { id: true, username: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ ok: true, announcement }, { status: 201 });
}

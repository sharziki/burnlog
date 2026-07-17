import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminToken } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const isAdmin = isAdminToken(req);

  const club = await prisma.club.findUnique({ where: { id }, select: { ownerId: true } });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!isAdmin && club.ownerId !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const events = await prisma.clubAuditEvent.findMany({
    where: { clubId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      actorType: true,
      action: true,
      meta: true,
      createdAt: true,
      actorUser: { select: { username: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    events: events.map((event) => ({
      ...event,
      meta: event.meta ? JSON.parse(event.meta) : null,
    })),
  });
}

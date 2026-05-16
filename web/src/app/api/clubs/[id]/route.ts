import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, username: true, name: true, image: true } },
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true, image: true, bio: true } },
        },
      },
    },
  });

  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const memberIds = club.memberships.map((m) => m.userId);

  const tokensByUser = memberIds.length
    ? await prisma.burnEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: memberIds } },
        _sum: { totalTokens: true },
      })
    : [];
  const tokenMap = new Map(tokensByUser.map((t) => [t.userId, t._sum.totalTokens ?? 0]));

  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const weekStart = new Date(Date.now() - WEEK);
  const weeklyByUser = memberIds.length
    ? await prisma.burnEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: memberIds }, timestamp: { gte: weekStart } },
        _sum: { totalTokens: true },
      })
    : [];
  const weeklyMap = new Map(weeklyByUser.map((t) => [t.userId, t._sum.totalTokens ?? 0]));

  const members = club.memberships
    .map((m) => ({
      ...m.user,
      totalTokens: tokenMap.get(m.userId) ?? 0,
      weeklyTokens: weeklyMap.get(m.userId) ?? 0,
      joinedAt: m.joinedAt,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const totalTokens = members.reduce((s, m) => s + m.totalTokens, 0);
  const weeklyTokens = members.reduce((s, m) => s + m.weeklyTokens, 0);

  return NextResponse.json({
    ok: true,
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      image: club.image,
      createdAt: club.createdAt,
      owner: club.owner,
      memberCount: members.length,
      totalTokens,
      weeklyTokens,
      isMember: memberIds.includes(userId),
      isOwner: club.ownerId === userId,
      members,
    },
  });
}

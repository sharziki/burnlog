import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

async function resolveUsers(username: string, viewerId?: string) {
  const target = await prisma.user.findFirst({
    where: { username },
    select: { id: true, username: true, name: true },
  });

  if (!target) {
    return { error: NextResponse.json({ message: "User not found" }, { status: 404 }) };
  }

  if (!viewerId) {
    return { target, viewer: null };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { id: true, username: true, name: true },
  });

  if (!viewer) {
    return { error: NextResponse.json({ message: "Viewer not found" }, { status: 404 }) };
  }

  return { target, viewer };
}

export async function GET(_: Request, context: { params: Promise<{ username: string }> }) {
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const { username } = await context.params;

  const resolved = await resolveUsers(username, viewerId);
  if ("error" in resolved) return resolved.error;

  const { target, viewer } = resolved;
  const [followersCount, followingCount, isFollowing] = await Promise.all([
    prisma.follow.count({ where: { followingId: target.id } }),
    prisma.follow.count({ where: { followerId: target.id } }),
    viewer
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewer.id, followingId: target.id } },
          select: { id: true },
        })
      : null,
  ]);

  return NextResponse.json({
    followersCount,
    followingCount,
    isFollowing: Boolean(isFollowing),
    canFollow: Boolean(viewer && viewer.id !== target.id),
  });
}

export async function POST(_: Request, context: { params: Promise<{ username: string }> }) {
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) {
    return NextResponse.json({ message: "Sign in required" }, { status: 401 });
  }

  const { username } = await context.params;
  const resolved = await resolveUsers(username, viewerId);
  if ("error" in resolved) return resolved.error;

  const { target, viewer } = resolved;
  if (!viewer) {
    return NextResponse.json({ message: "Viewer not found" }, { status: 404 });
  }

  if (viewer.id === target.id) {
    return NextResponse.json({ message: "You can't follow yourself" }, { status: 400 });
  }

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: viewer.id, followingId: target.id } },
    update: {},
    create: { followerId: viewer.id, followingId: target.id },
  });

  await prisma.notification.create({
    data: {
      userId: target.id,
      type: "follow",
      message: `@${viewer.username ?? viewer.name ?? "someone"} followed you.`,
      link: viewer.username ? `/u/${viewer.username}` : null,
      meta: JSON.stringify({ followerUsername: viewer.username ?? null }),
    },
  }).catch(() => undefined);

  const followersCount = await prisma.follow.count({ where: { followingId: target.id } });

  return NextResponse.json({ success: true, isFollowing: true, followersCount });
}

export async function DELETE(_: Request, context: { params: Promise<{ username: string }> }) {
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) {
    return NextResponse.json({ message: "Sign in required" }, { status: 401 });
  }

  const { username } = await context.params;
  const resolved = await resolveUsers(username, viewerId);
  if ("error" in resolved) return resolved.error;

  const { target, viewer } = resolved;
  if (!viewer) {
    return NextResponse.json({ message: "Viewer not found" }, { status: 404 });
  }

  await prisma.follow.deleteMany({
    where: { followerId: viewer.id, followingId: target.id },
  });

  const followersCount = await prisma.follow.count({ where: { followingId: target.id } });

  return NextResponse.json({ success: true, isFollowing: false, followersCount });
}

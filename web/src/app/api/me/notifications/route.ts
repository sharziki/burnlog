import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/notifications
 * Returns the latest 50 notifications for the logged-in user.
 * Query params: ?unread=1 to filter unread only
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, read: false },
  });

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      meta: n.meta ? JSON.parse(n.meta) : null,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}

/**
 * POST /api/me/notifications
 * Body: { action: "mark_read", ids: string[] } or { action: "mark_all_read" }
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { action: string; ids?: string[] };
  try {
    body = (await req.json()) as { action: string; ids?: string[] };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (body.action === "mark_all_read") {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_read" && Array.isArray(body.ids) && body.ids.length > 0) {
    // Only mark notifications that belong to this user
    await prisma.notification.updateMany({
      where: { userId, id: { in: body.ids.slice(0, 100) } },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}

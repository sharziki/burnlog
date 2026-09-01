import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { getLeaderboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * The board, scoped.
 *
 *   ?scope=world           everyone (default)
 *   ?scope=club&club=slug  one club's members
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "world";
  const clubSlug = url.searchParams.get("club");

  const session = await auth();
  let meId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!meId && req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) meId = result.key.userId;
  }

  let userIds: string[] | null = null;

  if (scope === "club") {
    if (!clubSlug) {
      return NextResponse.json(
        { ok: false, error: "missing_club", message: "club slug required" },
        { status: 400 },
      );
    }
    const club = await prisma.club.findUnique({
      where: { slug: clubSlug },
      select: { id: true, isPrivate: true, memberships: { select: { userId: true } } },
    });
    if (!club) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const memberIds = club.memberships.map((m) => m.userId);
    if (club.isPrivate && (!meId || !memberIds.includes(meId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    userIds = memberIds;
  }

  const users = await getLeaderboard({ userIds });
  return NextResponse.json({ ok: true, scope, users });
}

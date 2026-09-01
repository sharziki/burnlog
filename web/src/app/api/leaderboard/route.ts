import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { getBoard } from "@/lib/stats";

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

  /**
   * Identity, resolved only if the answer depends on it.
   *
   * This used to run unconditionally at the top of the handler. Once the
   * friends scope was removed, `meId` was read by the club branch and nowhere
   * else — so every request for the default world board paid for a session
   * lookup, and a bearer request paid for an API-key lookup too, to compute a
   * value that was then thrown away. Measured: the world board's median went
   * 0.10s → 0.81s between 5 and 100 concurrent requests, an 8x slope on an
   * endpoint whose data is cached and should have been flat.
   */
  const whoami = async (): Promise<string | null> => {
    const session = await auth();
    const fromSession = (session?.user as { id?: string } | undefined)?.id ?? null;
    if (fromSession) return fromSession;
    if (!req.headers.get("authorization")?.startsWith("Bearer ")) return null;
    const result = await authFromBearer(req);
    return "key" in result ? result.key.userId : null;
  };

  let userIds: string[] | null = null;

  if (scope === "club") {
    if (!clubSlug) {
      return NextResponse.json(
        { ok: false, error: "missing_club", message: "club slug required" },
        { status: 400 },
      );
    }
    const meId = await whoami();
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

  const users = await getBoard({ userIds });
  return NextResponse.json({ ok: true, scope, users });
}

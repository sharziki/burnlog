import { NextResponse } from "next/server";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/orgs — list orgs (clubs) visible to the bearer key's user:
// all public orgs plus any the user already belongs to or owns. Used by the
// burnlog MCP `list_orgs` tool so an agent can discover joinable orgs.
export async function GET(req: Request) {
  const auth = await authFromBearer(req, { limit: 120 });
  if ("error" in auth) return auth.error;
  const userId = auth.key.userId;

  const clubs = await prisma.club.findMany({
    where: {
      OR: [
        { isPrivate: false },
        { ownerId: userId },
        { memberships: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isPrivate: true,
      ownerId: true,
      createdAt: true,
      _count: { select: { memberships: true } },
      memberships: { where: { userId }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    ok: true,
    username: auth.key.username,
    orgs: clubs.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      isPrivate: c.isPrivate,
      memberCount: c._count.memberships,
      isMember: c.memberships.length > 0,
      isOwner: c.ownerId === userId,
    })),
  });
}

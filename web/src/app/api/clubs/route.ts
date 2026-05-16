import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; description?: string; image?: string };
  const name = (body.name ?? "").trim();
  if (!name || name.length > 50) {
    return NextResponse.json(
      { ok: false, error: "invalid_name", message: "Name must be 1-50 characters" },
      { status: 400 },
    );
  }

  let slug = slugify(name);
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "invalid_name", message: "Name must contain at least one letter or number" },
      { status: 400 },
    );
  }
  slug = slug.slice(0, 60);

  const existing = await prisma.club.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const still = await prisma.club.findUnique({ where: { slug } });
    if (still) {
      return NextResponse.json(
        { ok: false, error: "slug_taken", message: "Club name too similar to an existing club" },
        { status: 409 },
      );
    }
  }

  const description = (body.description ?? "").trim() || null;

  let image: string | null = null;
  if (body.image && typeof body.image === "string" && body.image.startsWith("data:image/")) {
    if (body.image.length > 500_000) {
      return NextResponse.json(
        { ok: false, error: "image_too_large", message: "Image must be under 500KB" },
        { status: 400 },
      );
    }
    image = body.image;
  }

  const club = await prisma.$transaction(async (tx) => {
    const c = await tx.club.create({
      data: { name, slug, description, image, ownerId: userId },
    });
    await tx.clubMembership.create({
      data: { clubId: c.id, userId },
    });
    return c;
  });

  return NextResponse.json(
    { ok: true, club: { id: club.id, name: club.name, slug: club.slug, description: club.description } },
    { status: 201 },
  );
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const clubs = await prisma.club.findMany({
    include: {
      owner: { select: { username: true, name: true, image: true } },
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true, image: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const allMemberIds = [...new Set(clubs.flatMap((c) => c.memberships.map((m) => m.userId)))];

  const tokensByUser = allMemberIds.length
    ? await prisma.burnEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: allMemberIds } },
        _sum: { totalTokens: true },
      })
    : [];
  const tokenMap = new Map(tokensByUser.map((t) => [t.userId, t._sum.totalTokens ?? 0]));

  const result = clubs
    .map((c) => {
      const totalTokens = c.memberships.reduce((s, m) => s + (tokenMap.get(m.userId) ?? 0), 0);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        image: c.image,
        createdAt: c.createdAt,
        owner: c.owner,
        memberCount: c.memberships.length,
        totalTokens,
        isMember: c.memberships.some((m) => m.userId === userId),
        isOwner: c.ownerId === userId,
        topMembers: c.memberships
          .map((m) => ({ ...m.user, totalTokens: tokenMap.get(m.userId) ?? 0 }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .slice(0, 5),
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({ ok: true, clubs: result });
}

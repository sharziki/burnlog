import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getClubUsageBatch } from "@/lib/clubUsage";
import { clubLimits, clubPlan } from "@/lib/clubPlan";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_BUDGET_TOKENS = 2_000_000_000;

function parseBudget(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_BUDGET_TOKENS, Math.max(0, Math.floor(n)));
}

function inviteCode(): string {
  return randomBytes(8).toString("base64url");
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    image?: string;
    isPrivate?: boolean;
    monthlyBudgetTokens?: number;
  };
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
        { ok: false, error: "slug_taken", message: "Team name too similar to an existing team" },
        { status: 409 },
      );
    }
  }

  const description = (body.description ?? "").trim() || null;
  const monthlyBudgetTokens = parseBudget(body.monthlyBudgetTokens);
  const isPrivate = body.isPrivate === true;

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
      data: {
        name,
        slug,
        description,
        image,
        isPrivate,
        inviteCode: isPrivate ? inviteCode() : null,
        monthlyBudgetTokens,
        ownerId: userId,
      },
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
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const clubs = await prisma.club.findMany({
    where: userId
      ? { OR: [{ isPrivate: false }, { ownerId: userId }, { memberships: { some: { userId } } }] }
      : { isPrivate: false },
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

  // One batched read instead of six queries per club.
  const usageByClub = await getClubUsageBatch(
    clubs.map((c) => ({ id: c.id, memberIds: c.memberships.map((m) => m.userId) })),
  );

  const result = await Promise.all(
    clubs.map(async (c) => {
      const usage = usageByClub.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        image: c.image,
        isPrivate: c.isPrivate,
        plan: clubPlan(c.plan),
        limits: clubLimits(c.plan),
        createdAt: c.createdAt,
        owner: c.owner,
        memberCount: c.memberships.length,
        totalTokens: usage.totalTokens,
        monthlyTokens: usage.monthlyTokens,
        serviceTokens: usage.serviceTotalTokens,
        monthlyBudgetTokens: c.monthlyBudgetTokens,
        isMember: userId ? c.memberships.some((m) => m.userId === userId) : false,
        isOwner: userId ? c.ownerId === userId : false,
        topMembers: c.memberships
          .map((m) => ({ ...m.user, totalTokens: usage.memberTotalMap.get(m.userId) ?? 0 }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
          .slice(0, 5),
      };
    }),
  );
  result.sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({ ok: true, clubs: result });
}

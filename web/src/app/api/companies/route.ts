import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { companyLimits, companyPlan } from "@/lib/clubPlan";
import { slugifyCompany } from "@/lib/companies";
import { getTeamBurnProfilesBatch } from "@/lib/companyUsage";

export const dynamic = "force-dynamic";

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/**
 * Companies are managed from the dashboard (session cookie) and read back by
 * the CLI (bearer API key). Resolve whichever credential the caller brought.
 */
async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;

  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) return result.key.userId;
  }
  return null;
}

export async function GET(req: Request) {
  const userId = await currentUserId(req);
  // No anonymous listing: a company maps to a customer's org chart, so there
  // is no "browse all companies" the way there is for public clubs.
  if (!userId) return NextResponse.json({ ok: true, companies: [] });

  const companies = await prisma.company.findMany({
    where: {
      OR: [{ ownerId: userId }, { teams: { some: { memberships: { some: { userId } } } } }],
    },
    include: {
      owner: { select: { username: true, name: true, image: true } },
      teams: {
        select: {
          id: true,
          name: true,
          slug: true,
          memberships: { select: { userId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // One batched read across every team of every company, not per company.
  const profiles = await getTeamBurnProfilesBatch(
    companies.flatMap((c) =>
      c.teams.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        memberIds: t.memberships.map((m) => m.userId),
      })),
    ),
  );
  const byTeam = new Map(profiles.map((p) => [p.id, p]));

  const result = companies.map((c) => {
    const teams = c.teams.map((t) => byTeam.get(t.id)!);
    const sum = (pick: (p: (typeof teams)[number]) => number) =>
      teams.reduce((s, p) => s + pick(p), 0);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      plan: companyPlan(c.plan),
      limits: companyLimits(c.plan),
      createdAt: c.createdAt,
      owner: c.owner,
      isOwner: c.ownerId === userId,
      teamCount: teams.length,
      memberCount: sum((p) => p.memberCount),
      totalTokens: sum((p) => p.totalTokens),
      windowTokens: sum((p) => p.windowTokens),
    };
  });
  result.sort((a, b) => b.windowTokens - a.windowTokens);

  return NextResponse.json({ ok: true, companies: result });
}

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to create a company");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "bad_json", "request body is not valid json");
  }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > MAX_NAME) {
    return bad(400, "invalid_name", `Name must be 1-${MAX_NAME} characters`);
  }

  let slug = slugifyCompany(name);
  if (!slug) {
    return bad(400, "invalid_name", "Name must contain at least one letter or number");
  }
  // Same collision dance as clubs: one suffixed retry, then give up rather
  // than loop, because a second clash means the name is genuinely taken.
  if (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    if (await prisma.company.findUnique({ where: { slug } })) {
      return bad(409, "slug_taken", "Company name too similar to an existing company");
    }
  }

  const description = String(body.description ?? "").trim().slice(0, MAX_DESCRIPTION) || null;

  const company = await prisma.company.create({
    data: { name, slug, description, ownerId: userId },
  });

  return NextResponse.json(
    {
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        description: company.description,
        plan: companyPlan(company.plan),
        limits: companyLimits(company.plan),
      },
    },
    { status: 201 },
  );
}

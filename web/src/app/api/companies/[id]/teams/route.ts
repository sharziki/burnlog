import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { loadCompanyForViewer } from "@/lib/companies";
import { getTeamBurnProfilesBatch } from "@/lib/companyUsage";

export const dynamic = "force-dynamic";

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId(req);
  const company = await loadCompanyForViewer(id, userId);
  // 404 rather than 403 for outsiders — confirming a company exists is itself
  // the leak we're avoiding by not listing companies publicly.
  if (!company) return bad(404, "not_found", "no such company");

  const teams = await getTeamBurnProfilesBatch(
    company.teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, memberIds: t.memberIds })),
  );
  const meta = new Map(company.teams.map((t) => [t.id, t]));

  const result = teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: meta.get(t.id)?.description ?? null,
      image: meta.get(t.id)?.image ?? null,
      memberCount: t.memberCount,
      contributors: t.contributors,
      totalTokens: t.totalTokens,
      windowTokens: t.windowTokens,
      daily: t.daily,
    }))
    .sort((a, b) => b.windowTokens - a.windowTokens);

  return NextResponse.json({
    ok: true,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      description: company.description,
      plan: company.plan,
      limits: company.limits,
      canManage: company.canManage,
    },
    teams: result,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to add a team");

  const company = await loadCompanyForViewer(id, userId);
  if (!company) return bad(404, "not_found", "no such company");
  if (!company.canManage) return bad(403, "not_owner", "only the company owner can add teams");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "bad_json", "request body is not valid json");
  }

  const ref = String(body.clubId ?? body.slug ?? "").trim();
  if (!ref) return bad(400, "missing_club", "pass the club id or slug to attach");

  if (company.teams.length >= company.limits.teamLimit) {
    return bad(
      403,
      "team_limit",
      `The ${company.plan} plan holds ${company.limits.teamLimit} teams`,
    );
  }

  const club = await prisma.club.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, name: true, slug: true, ownerId: true, companyId: true },
  });
  if (!club) return bad(404, "no_club", "no such club");

  // Both sides have to consent, and the only consent we can check is
  // ownership: without this, any company owner could quietly absorb someone
  // else's club and start reporting on its burn.
  if (club.ownerId !== userId) {
    return bad(403, "not_club_owner", "you must own the club to attach it as a team");
  }
  if (club.companyId && club.companyId !== company.id) {
    return bad(409, "already_attached", "that club already belongs to another company");
  }
  if (club.companyId === company.id) {
    return NextResponse.json({ ok: true, team: { id: club.id, name: club.name, slug: club.slug } });
  }

  await prisma.club.update({ where: { id: club.id }, data: { companyId: company.id } });

  return NextResponse.json(
    { ok: true, team: { id: club.id, name: club.name, slug: club.slug } },
    { status: 201 },
  );
}

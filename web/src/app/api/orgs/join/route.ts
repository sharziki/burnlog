import { NextResponse } from "next/server";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { clubLimits } from "@/lib/clubPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/orgs/join — join an org (club) using a bearer key. Mirrors the
// session-gated /api/clubs/[id]/join route so the burnlog MCP `join_org` tool
// can join on the user's behalf. Body: { slug?, id?, inviteCode? }.
export async function POST(req: Request) {
  const auth = await authFromBearer(req, { limit: 20 });
  if ("error" in auth) return auth.error;
  const userId = auth.key.userId;

  let body: { slug?: string; id?: string; inviteCode?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {}

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!slug && !id) {
    return NextResponse.json(
      { ok: false, error: "missing_org", message: "Provide an org slug or id" },
      { status: 400 },
    );
  }

  const club = id
    ? await prisma.club.findUnique({ where: { id } })
    : await prisma.club.findUnique({ where: { slug } });
  if (!club) {
    return NextResponse.json({ ok: false, error: "not_found", message: "Org not found" }, { status: 404 });
  }

  if (club.isPrivate) {
    if (!body.inviteCode || body.inviteCode !== club.inviteCode) {
      return NextResponse.json(
        { ok: false, error: "bad_invite", message: "Valid invite code required to join this private org" },
        { status: 403 },
      );
    }
  }

  const existing = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: club.id, userId } },
  });
  if (existing) {
    return NextResponse.json(
      { ok: true, alreadyMember: true, org: { id: club.id, name: club.name, slug: club.slug } },
    );
  }

  const members = await prisma.clubMembership.count({ where: { clubId: club.id } });
  const limits = clubLimits(club.plan);
  if (members >= limits.memberLimit) {
    return NextResponse.json(
      { ok: false, error: "member_limit", message: `${club.plan} plan allows ${limits.memberLimit} members` },
      { status: 409 },
    );
  }

  await prisma.clubMembership.create({ data: { clubId: club.id, userId } });
  return NextResponse.json(
    { ok: true, joined: true, org: { id: club.id, name: club.name, slug: club.slug } },
    { status: 201 },
  );
}

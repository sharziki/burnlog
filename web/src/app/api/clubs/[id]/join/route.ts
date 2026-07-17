import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { clubLimits } from "@/lib/clubPlan";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (club.isPrivate) {
    let body: { inviteCode?: string } = {};
    try {
      body = (await req.json()) as { inviteCode?: string };
    } catch {}
    if (!body.inviteCode || body.inviteCode !== club.inviteCode) {
      return NextResponse.json(
        { ok: false, error: "bad_invite", message: "Valid invite code required" },
        { status: 403 },
      );
    }
  }

  const existing = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: id, userId } },
  });
  if (existing) {
    return NextResponse.json({ ok: false, error: "already_member" }, { status: 409 });
  }

  const members = await prisma.clubMembership.count({ where: { clubId: id } });
  const limits = clubLimits(club.plan);
  if (members >= limits.memberLimit) {
    return NextResponse.json(
      { ok: false, error: "member_limit", message: `${club.plan} plan allows ${limits.memberLimit} members` },
      { status: 409 },
    );
  }

  await prisma.clubMembership.create({ data: { clubId: id, userId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { isAdminToken } from "@/lib/adminAuth";
import { clubLimits, clubPlan } from "@/lib/clubPlan";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; force?: unknown };
  const rawPlan = typeof body.plan === "string" ? body.plan : "";
  if (!["free", "team", "enterprise"].includes(rawPlan)) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  const { id } = await params;
  const current = await prisma.club.findUnique({
    where: { id },
    select: { _count: { select: { memberships: true, apiKeys: true } } },
  });
  if (!current) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const targetLimits = clubLimits(rawPlan);
  const overLimit =
    current._count.memberships > targetLimits.memberLimit ||
    current._count.apiKeys > targetLimits.teamKeyLimit;
  if (overLimit && body.force !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "plan_limit_conflict",
        message: "current team exceeds target plan limits; resend with force:true to override",
        counts: { members: current._count.memberships, teamKeys: current._count.apiKeys },
        limits: targetLimits,
      },
      { status: 409 },
    );
  }

  const club = await prisma.$transaction(async (tx) => {
    const before = await tx.club.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, plan: true, owner: { select: { email: true } } },
    });
    if (!before) return null;
    const after = await tx.club.update({
      where: { id },
      data: { plan: rawPlan },
      select: { id: true, name: true, slug: true, plan: true },
    });
    const leadStatus = rawPlan !== "free" ? "won" : before.plan !== "free" ? "lost" : null;
    const lead = leadStatus && before.owner.email
      ? await tx.teamLead.updateMany({
          where: { email: before.owner.email.toLowerCase() },
          data: { status: leadStatus },
        })
      : { count: 0 };
    await tx.clubAuditEvent.create({
      data: {
        clubId: id,
        actorType: "admin",
        action: "club_plan_updated",
        meta: JSON.stringify({
          from: before.plan,
          to: rawPlan,
          forced: body.force === true,
          counts: { members: current._count.memberships, teamKeys: current._count.apiKeys },
          limits: targetLimits,
          leadStatusUpdated: lead.count > 0 ? leadStatus : null,
        }),
      },
    });
    return { ...after, leadStatusUpdated: lead.count > 0 ? leadStatus : null };
  }).catch(() => null);

  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    leadStatusUpdated: club.leadStatusUpdated,
    club: { id: club.id, name: club.name, slug: club.slug, plan: clubPlan(club.plan), limits: clubLimits(club.plan) },
  });
}

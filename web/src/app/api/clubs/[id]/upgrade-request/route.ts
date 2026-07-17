import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { clubLimits, clubPlan } from "@/lib/clubPlan";
import { getClubUsage } from "@/lib/clubUsage";
import { logClubAudit } from "@/lib/clubAudit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true, username: true } },
      memberships: { select: { userId: true } },
    },
  });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (club.ownerId !== userId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!club.owner.email) return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });

  const [usage, activeKeys] = await Promise.all([
    getClubUsage(club.id, club.memberships.map((m) => m.userId)),
    prisma.apiKey.count({ where: { clubId: club.id } }),
  ]);
  const plan = clubPlan(club.plan);
  const limits = clubLimits(plan);
  const useCase = [
    `Upgrade request for /${club.slug}.`,
    `Plan: ${plan}.`,
    `Members: ${club.memberships.length}/${limits.memberLimit}.`,
    `Team keys: ${activeKeys}/${limits.teamKeyLimit}.`,
    `MTD tokens: ${usage.monthlyTokens}.`,
    `Monthly budget: ${club.monthlyBudgetTokens}.`,
  ].join(" ");

  await prisma.teamLead.upsert({
    where: { email: club.owner.email.toLowerCase() },
    create: {
      email: club.owner.email.toLowerCase(),
      name: club.owner.name ?? club.owner.username,
      company: club.name,
      teamSize: `${club.memberships.length} members`,
      useCase,
      source: "club_upgrade",
    },
    update: {
      name: club.owner.name ?? club.owner.username,
      company: club.name,
      teamSize: `${club.memberships.length} members`,
      useCase,
      source: "club_upgrade",
      status: "new",
    },
  });

  await logClubAudit({
    clubId: club.id,
    actorType: "owner",
    actorUserId: userId,
    action: "club_upgrade_requested",
    meta: { plan, members: club.memberships.length, activeKeys },
  });

  return NextResponse.json({ ok: true });
}

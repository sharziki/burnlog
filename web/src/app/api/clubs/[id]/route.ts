import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getClubUsage } from "@/lib/clubUsage";
import { clubLimits, clubPlan } from "@/lib/clubPlan";
import { logClubAudit } from "@/lib/clubAudit";

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

function cleanWebhookUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const raw = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const { id } = await params;

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, username: true, name: true, image: true } },
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true, image: true, bio: true } },
        },
      },
    },
  });

  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const memberIds = club.memberships.map((m) => m.userId);
  const isMember = userId ? memberIds.includes(userId) : false;
  const isOwner = userId ? club.ownerId === userId : false;
  if (club.isPrivate && !isMember && !isOwner) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const usage = await getClubUsage(club.id, memberIds);

  const members = club.memberships
    .map((m) => ({
      ...m.user,
      totalTokens: usage.memberTotalMap.get(m.userId) ?? 0,
      weeklyTokens: usage.memberWeeklyMap.get(m.userId) ?? 0,
      joinedAt: m.joinedAt,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({
    ok: true,
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      image: club.image,
      isPrivate: club.isPrivate,
      plan: clubPlan(club.plan),
      limits: clubLimits(club.plan),
      inviteCode: isOwner ? club.inviteCode : null,
      budgetWebhookUrl: isOwner ? club.budgetWebhookUrl : null,
      blockIngestOnBudget: isOwner ? club.blockIngestOnBudget : false,
      createdAt: club.createdAt,
      owner: club.owner,
      memberCount: members.length,
      totalTokens: usage.totalTokens,
      weeklyTokens: usage.weeklyTokens,
      monthlyTokens: usage.monthlyTokens,
      serviceTokens: usage.serviceTotalTokens,
      monthlyBudgetTokens: club.monthlyBudgetTokens,
      isMember,
      isOwner,
      members,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { ownerId: true, inviteCode: true },
  });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (club.ownerId !== userId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    monthlyBudgetTokens?: unknown;
    isPrivate?: unknown;
    rotateInvite?: unknown;
    budgetWebhookUrl?: unknown;
    blockIngestOnBudget?: unknown;
  };
  const isPrivate = typeof body.isPrivate === "boolean" ? body.isPrivate : undefined;
  const blockIngestOnBudget = typeof body.blockIngestOnBudget === "boolean" ? body.blockIngestOnBudget : undefined;
  const budgetWebhookUrl = cleanWebhookUrl(body.budgetWebhookUrl);
  if (body.budgetWebhookUrl !== undefined && budgetWebhookUrl === undefined) {
    return NextResponse.json({ ok: false, error: "invalid_webhook_url" }, { status: 400 });
  }
  const data: {
    monthlyBudgetTokens?: number;
    isPrivate?: boolean;
    inviteCode?: string | null;
    budgetWebhookUrl?: string | null;
    blockIngestOnBudget?: boolean;
  } = {};
  if (body.monthlyBudgetTokens !== undefined) {
    data.monthlyBudgetTokens = parseBudget(body.monthlyBudgetTokens);
  }
  if (budgetWebhookUrl !== undefined) data.budgetWebhookUrl = budgetWebhookUrl;
  if (blockIngestOnBudget !== undefined) data.blockIngestOnBudget = blockIngestOnBudget;
  if (isPrivate === false) {
    data.isPrivate = false;
    data.inviteCode = null;
  } else if (isPrivate === true) {
    data.isPrivate = true;
    data.inviteCode = club.inviteCode ?? inviteCode();
  }
  if (body.rotateInvite === true) {
    data.isPrivate = true;
    data.inviteCode = inviteCode();
  }

  const updated = await prisma.club.update({
    where: { id },
    data,
    select: { id: true, isPrivate: true, inviteCode: true, monthlyBudgetTokens: true, budgetWebhookUrl: true, blockIngestOnBudget: true },
  });

  await logClubAudit({
    clubId: id,
    actorType: "owner",
    actorUserId: userId,
    action: "club_settings_updated",
    meta: {
      monthlyBudgetTokens: data.monthlyBudgetTokens,
      isPrivate: data.isPrivate,
      rotateInvite: body.rotateInvite === true,
      budgetWebhookUrlChanged: budgetWebhookUrl !== undefined,
      blockIngestOnBudget: data.blockIngestOnBudget,
    },
  });

  return NextResponse.json({ ok: true, club: updated });
}

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateApiKey } from "@/lib/apiKey";
import { clubLimits } from "@/lib/clubPlan";
import { prisma } from "@/lib/db";
import { logClubAudit } from "@/lib/clubAudit";

function cleanLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.trim().replace(/\s+/g, " ").slice(0, 60) || fallback;
}

function parseBudget(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(2_000_000_000, Math.max(0, Math.floor(n)));
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function requireOwner(id: string) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const club = await prisma.club.findUnique({ where: { id }, select: { ownerId: true, slug: true, plan: true } });
  if (!club) return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  if (club.ownerId !== userId) return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  return { club, userId };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOwner(id);
  if ("error" in owner) return owner.error;

  const [keys, usage] = await Promise.all([
    prisma.apiKey.findMany({
      where: { clubId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, monthlyBudgetTokens: true, createdAt: true, lastUsed: true },
    }),
    prisma.burnEvent.groupBy({
      by: ["apiKeyId"],
      where: { clubId: id, timestamp: { gte: monthStartUtc() } },
      _sum: { totalTokens: true },
    }),
  ]);
  const usageMap = new Map(usage.map((row) => [row.apiKeyId, row._sum.totalTokens ?? 0]));

  return NextResponse.json({
    ok: true,
    keys: keys.map((key) => ({ ...key, monthlyTokens: usageMap.get(key.id) ?? 0 })),
    limit: clubLimits(owner.club.plan).teamKeyLimit,
    remaining: Math.max(0, clubLimits(owner.club.plan).teamKeyLimit - keys.length),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOwner(id);
  if ("error" in owner) return owner.error;

  const activeKeys = await prisma.apiKey.count({ where: { clubId: id } });
  const limit = clubLimits(owner.club.plan).teamKeyLimit;
  if (activeKeys >= limit) {
    return NextResponse.json(
      { ok: false, error: "key_limit", message: `${owner.club.plan} plan allows ${limit} team keys` },
      { status: 409 },
    );
  }

  const { raw, hash } = generateApiKey();
  const body = (await req.json().catch(() => ({}))) as { label?: unknown; monthlyBudgetTokens?: unknown };
  const label = cleanLabel(body.label, `team:${owner.club.slug}`);
  const monthlyBudgetTokens = parseBudget(body.monthlyBudgetTokens);
  await prisma.apiKey.create({
    data: {
      userId: owner.userId,
      clubId: id,
      keyHash: hash,
      label,
      monthlyBudgetTokens,
    },
  });
  await logClubAudit({
    clubId: id,
    actorType: "owner",
    actorUserId: owner.userId,
    action: "team_api_key_created",
    meta: { label, monthlyBudgetTokens },
  });

  return NextResponse.json({ ok: true, key: raw, label });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOwner(id);
  if ("error" in owner) return owner.error;

  const body = (await req.json().catch(() => ({}))) as { keyId?: string };
  if (!body.keyId) {
    return NextResponse.json({ ok: false, error: "missing_key_id" }, { status: 400 });
  }

  const deleted = await prisma.apiKey.deleteMany({ where: { id: body.keyId, clubId: id } });
  if (deleted.count > 0) {
    await logClubAudit({
      clubId: id,
      actorType: "owner",
      actorUserId: owner.userId,
      action: "team_api_key_revoked",
      meta: { keyId: body.keyId },
    });
  }
  return NextResponse.json({ ok: true });
}

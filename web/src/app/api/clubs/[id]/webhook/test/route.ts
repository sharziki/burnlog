import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { webhookSignature } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true, monthlyBudgetTokens: true, budgetWebhookUrl: true },
  });
  if (!club) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (club.ownerId !== userId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!club.budgetWebhookUrl) {
    return NextResponse.json({ ok: false, error: "missing_webhook_url" }, { status: 400 });
  }

  const body = JSON.stringify({
    type: "club_budget_test",
    clubId: club.id,
    clubName: club.name,
    threshold: 80,
    usedTokens: Math.floor(club.monthlyBudgetTokens * 0.8),
    budgetTokens: club.monthlyBudgetTokens,
    percentUsed: 80,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = webhookSignature(body, timestamp);

  try {
    const res = await fetch(club.budgetWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-burnlog-timestamp": timestamp,
        ...(signature ? { "x-burnlog-signature": signature } : {}),
      },
      body,
    });
    return NextResponse.json(
      { ok: res.ok, status: res.status },
      { status: res.ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "webhook_failed" }, { status: 502 });
  }
}

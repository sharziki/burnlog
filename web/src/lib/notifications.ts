import { createHmac } from "crypto";
import { prisma } from "./db";
import { formatTokens } from "./format";
import { getClubUsage } from "./clubUsage";

/**
 * Internal dedupe for optional club budget webhooks.
 *
 * Webhook failures never break token ingest.
 */

type Notify = {
  userId: string;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
  link?: string;
};

async function emit(n: Notify): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        message: n.message,
        meta: n.meta ? JSON.stringify(n.meta) : null,
        link: n.link ?? null,
      },
    });
  } catch {
    // The external webhook still gets its attempt if dedupe storage fails.
  }
}

// Reuse historical notification rows to avoid repeat budget webhooks.
async function recentlyNotified(
  userId: string,
  type: string,
  keySubstring: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      message: { contains: keySubstring },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return existing !== null;
}

const BUDGET_THRESHOLDS = [100, 80];

export function webhookSignature(body: string, timestamp: string, secret = process.env.BURNLOG_WEBHOOK_SECRET): string | null {
  if (!secret) return null;
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function sendBudgetWebhook(url: string | null, payload: Record<string, unknown>): void {
  if (!url) return;
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = webhookSignature(body, timestamp);
  void fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-burnlog-timestamp": timestamp,
      ...(signature ? { "x-burnlog-signature": signature } : {}),
    },
    body,
  }).catch(() => {});
}

export async function checkClubBudgetAlerts(userId: string): Promise<void> {
  try {
    const clubs = await prisma.club.findMany({
      where: {
        monthlyBudgetTokens: { gt: 0 },
        memberships: { some: { userId } },
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        monthlyBudgetTokens: true,
        budgetWebhookUrl: true,
        memberships: { select: { userId: true } },
      },
    });
    if (clubs.length === 0) return;

    for (const club of clubs) {
      const memberIds = club.memberships.map((m) => m.userId);
      const used = (await getClubUsage(club.id, memberIds)).monthlyTokens;
      const pct = Math.floor((used / club.monthlyBudgetTokens) * 100);
      const threshold = BUDGET_THRESHOLDS.find((t) => pct >= t);
      if (!threshold) continue;

      const key = `${club.name} hit ${threshold}%`;
      if (await recentlyNotified(club.ownerId, "club_budget", key, 7 * 24 * 60 * 60 * 1000)) continue;

      await emit({
        userId: club.ownerId,
        type: "club_budget",
        message: `${club.name} hit ${threshold}% of monthly token budget (${formatTokens(used)} / ${formatTokens(club.monthlyBudgetTokens)}).`,
        meta: { clubId: club.id, threshold, used, budget: club.monthlyBudgetTokens },
        link: "/",
      });
      sendBudgetWebhook(club.budgetWebhookUrl, {
        type: "club_budget",
        clubId: club.id,
        clubName: club.name,
        threshold,
        usedTokens: used,
        budgetTokens: club.monthlyBudgetTokens,
        percentUsed: pct,
      });
    }
  } catch {
    // A budget webhook failure cannot reject token ingest.
  }
}

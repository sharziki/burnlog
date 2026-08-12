import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { companyPriceId } from "@/lib/billing";
import { periodEndOf, stripeClient, webhookSecret } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — the only writer of subscription state.
 *
 * Nothing the browser sends can flip a company to paid: the client is told
 * where checkout is and nothing else. Stripe signs this request, we verify the
 * signature, and only then does a status change.
 */
export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = webhookSecret();
  if (!stripe || !secret) {
    return NextResponse.json(
      { ok: false, error: "billing_unconfigured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
  }

  // The raw text, before anything parses it. The signature covers the exact
  // bytes Stripe sent, so a JSON round-trip — which reorders keys and
  // renormalises numbers — invalidates it even though the object is identical.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      // The session says a payment happened; the subscription is what says on
      // what terms. Fetch it rather than inferring "active" from the session,
      // so a trial or an immediately-failed card reports what it really is.
      if (subscriptionId) {
        await applySubscription(await stripe.subscriptions.retrieve(subscriptionId));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object);
      break;
    default:
      // Everything else is noise for our purposes. Ack it so Stripe stops
      // retrying rather than leaving it to age out as a delivery failure.
      break;
  }

  return NextResponse.json({ ok: true, received: event.type });
}

/**
 * Write Stripe's view of a subscription onto its company.
 *
 * Matched by the companyId stamped at checkout, falling back to the customer —
 * a subscription created from the Stripe dashboard never gets our metadata,
 * and the customer id is the only other link back.
 */
async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const companyId = sub.metadata?.companyId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Only OUR price grants the tier. Without this, any other recurring product
  // sold to the same customer — or a cheaper plan reachable through the
  // billing portal's plan switcher — would mark the company fully paid.
  const priceId = companyPriceId();
  const subPrice = sub.items?.data?.[0]?.price?.id;
  if (priceId && subPrice && subPrice !== priceId) return;

  // Match on the metadata stamped at checkout, but fall back to the customer:
  // a dashboard-created subscription never carries our metadata, and a stale
  // companyId (company deleted and recreated) would otherwise never land.
  const company = await prisma.company.findFirst({
    where: companyId
      ? { OR: [{ id: companyId }, { stripeCustomerId: customerId }] }
      : { stripeCustomerId: customerId },
    select: { id: true, currentPeriodEnd: true, stripeSubscriptionId: true },
  });
  // A subscription for a company that has since been deleted is not an error
  // worth failing the webhook over — failing would only earn a retry loop.
  if (!company) return;

  // Stripe does not guarantee delivery order and retries for up to three days,
  // so an "active" update landing after a "deleted" would resurrect a cancelled
  // subscription for free. Ignore anything older than what we already have.
  const incomingEnd = periodEndOf(sub);
  if (
    company.stripeSubscriptionId === sub.id &&
    company.currentPeriodEnd &&
    incomingEnd &&
    incomingEnd < company.currentPeriodEnd
  ) {
    return;
  }

  try {
    await prisma.company.update({
      where: { id: company.id },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: incomingEnd,
      },
    });
  } catch {
    // stripeCustomerId is @unique; a customer already bound to another company
    // would throw P2002 and make Stripe retry this event forever. Swallow it —
    // a stuck retry loop is worse than a row we failed to update once.
  }
}

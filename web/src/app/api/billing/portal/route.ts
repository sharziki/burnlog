import { NextResponse } from "next/server";
import { sessionOrBearerUserId } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { siteOrigin, stripeClient } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/**
 * GET /api/billing/portal?company=<id|slug> — url for Stripe's billing portal.
 *
 * Card changes, invoices, and cancellation all live over there. Rebuilding any
 * of that here would mean handling card data burnlog has no reason to see.
 */
export async function GET(req: Request) {
  const stripe = stripeClient();
  if (!stripe) {
    return bad(503, "billing_unconfigured", "Billing isn't configured on this deployment");
  }

  const userId = await sessionOrBearerUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to manage billing");

  const ref = (new URL(req.url).searchParams.get("company") ?? "").trim();
  if (!ref) return bad(400, "missing_company", "pass ?company= as a company id or slug");

  const company = await prisma.company.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, slug: true, ownerId: true, stripeCustomerId: true },
  });
  if (!company || company.ownerId !== userId) return bad(404, "not_found", "no such company");
  if (!company.stripeCustomerId) {
    return bad(409, "no_customer", "this company has never been through checkout");
  }

  // Same reasoning as checkout: a Stripe-side failure returns the route's
  // normal error shape rather than escaping as an unhandled 500.
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${siteOrigin(req)}/companies/${company.slug}`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe request failed";
    return bad(502, "stripe_error", message);
  }
}

import { NextResponse } from "next/server";
import { sessionOrBearerUserId } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { companyPriceId, siteOrigin, stripeClient } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

/** POST /api/billing/checkout {company} — returns the Stripe Checkout url. */
export async function POST(req: Request) {
  const stripe = stripeClient();
  const priceId = companyPriceId();
  if (!stripe || !priceId) {
    return bad(
      503,
      "billing_unconfigured",
      "Billing isn't configured on this deployment (STRIPE_SECRET_KEY / STRIPE_PRICE_ID)",
    );
  }

  const userId = await sessionOrBearerUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to subscribe");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "bad_json", "request body is not valid json");
  }

  const ref = String(body.company ?? body.companyId ?? "").trim();
  if (!ref) return bad(400, "missing_company", "pass the company id or slug to subscribe");

  const company = await prisma.company.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      stripeCustomerId: true,
      owner: { select: { email: true } },
    },
  });
  // 404 rather than 403, same as the rest of the company API: whether a
  // company exists is itself the thing outsiders shouldn't be able to probe.
  if (!company || company.ownerId !== userId) return bad(404, "not_found", "no such company");

  // The customer is created once and kept: a second checkout after a
  // cancellation has to land on the same Stripe customer or the org's billing
  // history splits in two and the portal shows half of it.
  let customerId = company.stripeCustomerId;

  // Stripe is a network call to someone else's service: a rotated key, a rate
  // limit, or an outage must surface as the same typed error shape every other
  // failure in this route uses, not as an unhandled 500 the UI can't render.
  try {
    // The customer is created once and kept: a second checkout after a
    // cancellation has to land on the same Stripe customer or the org's billing
    // history splits in two and the portal shows half of it.
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.owner.email ?? undefined,
        name: company.name,
        metadata: { companyId: company.id, companySlug: company.slug },
      });
      customerId = customer.id;
      await prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = siteOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: company.id,
      // Stamped on the subscription as well as the session: subscription.updated
      // events months from now arrive with no session attached, and this is what
      // lets the webhook find the company without a reverse lookup.
      subscription_data: { metadata: { companyId: company.id } },
      success_url: `${origin}/companies/${company.slug}?checkout=success`,
      cancel_url: `${origin}/companies/${company.slug}?checkout=cancelled`,
    });

    if (!session.url) return bad(502, "no_checkout_url", "Stripe returned no checkout url");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe request failed";
    return bad(502, "stripe_error", message);
  }
}

import Stripe from "stripe";
import { CLUB_PLANS } from "./clubPlan";

/**
 * Stripe, kept behind accessors instead of a module-level client.
 *
 * burnlog is self-hostable and no dev machine has Stripe keys, so building the
 * client at import time would take down every page that so much as touches a
 * company — including the ones that never sell anything. Nothing here throws;
 * callers get null and decide what that means, and the UI says out loud that
 * billing is off rather than quietly handing out the paid tier.
 */

let client: Stripe | null = null;

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

/**
 * The Company tier's price id. There is deliberately no fallback: a hardcoded
 * price would charge whatever a stale constant said long after the real one
 * changed, and it would silently bill against the wrong Stripe account.
 */
export function companyPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID || null;
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/**
 * All THREE parts are required, not two.
 *
 * With a secret key and a price but no webhook secret, checkout succeeds and
 * cards get charged while every webhook delivery 503s — so `subscriptionStatus`
 * never leaves "inactive" and the customer who just paid stays locked out.
 * Charging people for nothing is worse than not selling, so a partial config
 * counts as unconfigured.
 */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && companyPriceId() && webhookSecret());
}

/**
 * Self-hosting escape hatch, as an explicit opt-in.
 *
 * The gate used to fall open whenever Stripe config was absent, which meant a
 * single deleted or mistyped env var silently made every company writable —
 * including ones Stripe had already cancelled — with no error and no alarm.
 * A missing key is far more likely to be an accident than a deliberate choice
 * to run unbilled, so unbilled now has to be asked for by name.
 */
export function billingDisabled(): boolean {
  return process.env.BURNLOG_BILLING_DISABLED === "true";
}

/**
 * Statuses that count as paying.
 *
 * `past_due` is in here on purpose. Stripe retries a failed card for days, and
 * locking an org out of its own tooling on retry #1 costs far more goodwill
 * than the handful of days it might cover. `unpaid` and `canceled` are where
 * Stripe has given up, and so do we.
 */
const PAID_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export type CompanyBillingFields = {
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
};

/**
 * The gate for the Company tier.
 *
 * Fails CLOSED: only an explicit BURNLOG_BILLING_DISABLED=true opens a company
 * without a subscription. Misconfigured Stripe leaves companies read-only and
 * loudly unconfigured, rather than quietly giving the tier away.
 *
 * Reads of a company's own numbers stay open — hiding someone's usage history
 * because a card expired punishes the wrong thing and removes the reason to
 * come back and fix it. What lapses is everything *ongoing*: see
 * `companyFeaturesEnabled`.
 */
export function companyIsWritable(company: CompanyBillingFields): boolean {
  if (billingDisabled()) return true;
  if (!billingConfigured()) return false;
  return PAID_STATUSES.has(company.subscriptionStatus);
}

/**
 * Whether the recurring, ongoing features of the tier are available.
 *
 * Gating only "attach a team" made the subscription non-load-bearing: a
 * company could subscribe for one month, attach its ten-team maximum, cancel,
 * and keep 100% of the tier forever, because nothing left was a write. The
 * team-vs-team comparison is the thing customers actually come back for, so
 * that is what a lapsed subscription loses.
 */
export function companyFeaturesEnabled(company: CompanyBillingFields): boolean {
  return companyIsWritable(company);
}

export type CompanyBillingView = {
  /**
   * The advertised monthly price.
   *
   * This comes from a local constant, NOT from Stripe, so it can drift from
   * what the customer is actually charged if the Stripe price changes. The
   * charge is always authoritative; treat this as a label and keep the two in
   * step deliberately.
   */
  monthlyPriceUsdIsLocal?: true;
  /** Whether this deployment can charge at all. False = unbilled, not free. */
  configured: boolean;
  /** Stripe's status verbatim, or "inactive" before the first checkout. */
  status: string;
  paid: boolean;
  writable: boolean;
  /** ISO, or null when there has never been a paid period. */
  currentPeriodEnd: string | null;
  /** Flat monthly price of the tier, from the plan table rather than Stripe. */
  monthlyPriceUsd: number | null;
};

/** One shape for the gate, so the API and the page can't disagree about it. */
export function describeCompanyBilling(company: CompanyBillingFields): CompanyBillingView {
  return {
    configured: billingConfigured(),
    status: company.subscriptionStatus,
    paid: PAID_STATUSES.has(company.subscriptionStatus),
    writable: companyIsWritable(company),
    currentPeriodEnd: company.currentPeriodEnd?.toISOString() ?? null,
    monthlyPriceUsd: CLUB_PLANS.company.monthlyPriceUsdFlat,
  };
}

/**
 * End of the paid period, in this API version, hangs off the subscription
 * *item* — the top-level `current_period_end` was removed when billing went
 * per-item, and reading the old field yields undefined rather than an error.
 * Items always has at least one entry for a real subscription.
 */
export function periodEndOf(sub: Stripe.Subscription): Date | null {
  const seconds = sub.items.data[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/**
 * Absolute base URL for Stripe's return trips.
 *
 * Stripe rejects relative URLs, and the request's own origin is the only value
 * that is right on preview deploys, localhost, and prod alike —
 * NEXT_PUBLIC_SITE_URL is pinned to production and would bounce a local
 * checkout onto the live site.
 */
export function siteOrigin(req: Request): string {
  return new URL(req.url).origin;
}

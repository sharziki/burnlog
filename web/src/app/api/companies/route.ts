import { NextResponse } from "next/server";
import { sessionOrBearerUserId } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { describeCompanyBilling } from "@/lib/billing";
import { companyLimits, companyPlan } from "@/lib/clubPlan";
import { listCompaniesForUser, slugifyCompany } from "@/lib/companies";

export const dynamic = "force-dynamic";

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function GET(req: Request) {
  const userId = await sessionOrBearerUserId(req);
  // No anonymous listing: a company maps to a customer's org chart, so there
  // is no "browse all companies" the way there is for public clubs.
  if (!userId) return NextResponse.json({ ok: true, companies: [] });

  return NextResponse.json({ ok: true, companies: await listCompaniesForUser(userId) });
}

/**
 * Creating a company is free; *using* one is not. The row is what checkout
 * needs something to attach a subscription to, so the paywall sits on the
 * writes (see companyIsWritable) rather than here, where refusing would leave
 * a would-be customer with nothing to pay for.
 */
export async function POST(req: Request) {
  const userId = await sessionOrBearerUserId(req);
  if (!userId) return bad(401, "unauthorized", "sign in to create a company");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, "bad_json", "request body is not valid json");
  }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > MAX_NAME) {
    return bad(400, "invalid_name", `Name must be 1-${MAX_NAME} characters`);
  }

  let slug = slugifyCompany(name);
  if (!slug) {
    return bad(400, "invalid_name", "Name must contain at least one letter or number");
  }
  // Same collision dance as clubs: one suffixed retry, then give up rather
  // than loop, because a second clash means the name is genuinely taken.
  if (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    if (await prisma.company.findUnique({ where: { slug } })) {
      return bad(409, "slug_taken", "Company name too similar to an existing company");
    }
  }

  const description = String(body.description ?? "").trim().slice(0, MAX_DESCRIPTION) || null;

  const company = await prisma.company.create({
    data: { name, slug, description, ownerId: userId },
  });

  return NextResponse.json(
    {
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        description: company.description,
        plan: companyPlan(company.plan),
        limits: companyLimits(company.plan),
        billing: describeCompanyBilling(company),
      },
    },
    { status: 201 },
  );
}

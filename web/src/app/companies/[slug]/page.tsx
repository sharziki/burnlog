import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { loadCompanyForViewer } from "@/lib/companies";
import { getTeamBurnProfilesBatch } from "@/lib/companyUsage";
import { CompanyClient } from "./CompanyClient";

export const dynamic = "force-dynamic";

// Deliberately generic: a company's name is only visible to its members, and
// generateMetadata would put it in a page title that anyone could probe for.
export const metadata: Metadata = { title: "company" };

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const company = await loadCompanyForViewer(slug, userId);
  // loadCompanyForViewer already returns null for outsiders, so a 404 here
  // covers both "no such company" and "not yours" without telling them apart.
  if (!company) notFound();

  const profiles = await getTeamBurnProfilesBatch(
    company.teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, memberIds: t.memberIds })),
  );
  const meta = new Map(company.teams.map((t) => [t.id, t]));

  const teams = profiles
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: meta.get(p.id)?.description ?? null,
      memberCount: p.memberCount,
      contributors: p.contributors,
      windowTokens: p.windowTokens,
      totalTokens: p.totalTokens,
    }))
    .sort((a, b) => b.windowTokens - a.windowTokens);

  const { checkout } = await searchParams;

  return (
    <CompanyClient
      company={{
        id: company.id,
        name: company.name,
        slug: company.slug,
        description: company.description,
        plan: company.plan,
        teamLimit: company.limits.teamLimit,
        canManage: company.canManage,
        billing: company.billing,
      }}
      teams={teams}
      checkout={checkout === "success" || checkout === "cancelled" ? checkout : null}
    />
  );
}

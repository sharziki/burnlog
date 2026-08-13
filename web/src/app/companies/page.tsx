import type { Metadata } from "next";
import { auth } from "@/auth";
import { billingConfigured } from "@/lib/billing";
import { CLUB_PLANS } from "@/lib/clubPlan";
import { listCompaniesForUser } from "@/lib/companies";
import { CompaniesClient } from "./CompaniesClient";
import { requireFullSurface } from "@/lib/surface";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "companies",
  description:
    "Hold several teams under one roof: company-wide rollups and team-vs-team head-to-head.",
};

export default async function CompaniesPage() {
  requireFullSurface();
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  return (
    <CompaniesClient
      companies={userId ? await listCompaniesForUser(userId) : []}
      signedIn={Boolean(userId)}
      // Read on the server because it's an env var; the client only needs to
      // know whether to say "billing is off on this deployment".
      billingLive={billingConfigured()}
      plan={CLUB_PLANS.company}
    />
  );
}

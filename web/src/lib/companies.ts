import { prisma } from "./db";
import { companyLimits, companyPlan, type ClubPlan } from "./clubPlan";

/**
 * Companies contain clubs. A club inside a company is called a "team" in every
 * user-facing surface, which is why the API paths say `/teams` while the rows
 * are still Club — renaming the table would have rewritten every existing
 * club URL for no product gain.
 */

export function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type CompanyTeamRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  memberIds: string[];
};

export type CompanyView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: ClubPlan;
  limits: ReturnType<typeof companyLimits>;
  ownerId: string;
  createdAt: Date;
  teams: CompanyTeamRow[];
  /** Owner-only actions: attaching teams, changing the roster. */
  canManage: boolean;
};

/**
 * Load a company by id *or* slug, with its teams and their rosters.
 *
 * Readable by the owner and by anyone who is a member of one of its teams.
 * Companies deliberately have no public listing: unlike clubs, they map to a
 * paying customer's org chart, and "which teams does ACME run" is not
 * something a stranger should be able to enumerate.
 */
export async function loadCompanyForViewer(
  idOrSlug: string,
  userId: string | null,
): Promise<CompanyView | null> {
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      teams: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          image: true,
          memberships: { select: { userId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!company) return null;

  const teams: CompanyTeamRow[] = company.teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    image: t.image,
    memberIds: t.memberships.map((m) => m.userId),
  }));

  const isOwner = Boolean(userId) && company.ownerId === userId;
  const isMember =
    Boolean(userId) && teams.some((t) => t.memberIds.includes(userId as string));
  if (!isOwner && !isMember) return null;

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    description: company.description,
    plan: companyPlan(company.plan),
    limits: companyLimits(company.plan),
    ownerId: company.ownerId,
    createdAt: company.createdAt,
    teams,
    canManage: isOwner,
  };
}

/** Resolve a team reference (club id or slug) against a loaded company. */
export function findTeam(company: CompanyView, ref: string): CompanyTeamRow | null {
  return company.teams.find((t) => t.id === ref || t.slug === ref) ?? null;
}

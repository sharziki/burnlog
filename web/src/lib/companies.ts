import { prisma } from "./db";
import { companyLimits, companyPlan, type ClubPlan } from "./clubPlan";
import { describeCompanyBilling, type CompanyBillingView } from "./billing";
import { getTeamBurnProfilesBatch } from "./companyUsage";

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
  billing: CompanyBillingView;
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
    billing: describeCompanyBilling(company),
  };
}

/** Resolve a team reference (club id or slug) against a loaded company. */
export function findTeam(company: CompanyView, ref: string): CompanyTeamRow | null {
  return company.teams.find((t) => t.id === ref || t.slug === ref) ?? null;
}

export type CompanyListRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: ClubPlan;
  limits: ReturnType<typeof companyLimits>;
  createdAt: Date;
  owner: { username: string | null; name: string | null; image: string | null };
  isOwner: boolean;
  billing: CompanyBillingView;
  teamCount: number;
  memberCount: number;
  totalTokens: number;
  windowTokens: number;
};

/**
 * Every company the user owns or has a team in, with its burn rolled up.
 *
 * Lives here rather than in the route because /companies renders the same list
 * server-side; two copies of this query would drift the moment either grew a
 * field, and the rollup is the part that has to match exactly.
 */
export async function listCompaniesForUser(userId: string): Promise<CompanyListRow[]> {
  const companies = await prisma.company.findMany({
    where: {
      OR: [{ ownerId: userId }, { teams: { some: { memberships: { some: { userId } } } } }],
    },
    include: {
      owner: { select: { username: true, name: true, image: true } },
      teams: {
        select: {
          id: true,
          name: true,
          slug: true,
          memberships: { select: { userId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // One batched read across every team of every company, not per company.
  const profiles = await getTeamBurnProfilesBatch(
    companies.flatMap((c) =>
      c.teams.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        memberIds: t.memberships.map((m) => m.userId),
      })),
    ),
  );
  const byTeam = new Map(profiles.map((p) => [p.id, p]));

  const rows = companies.map((c) => {
    const teams = c.teams.map((t) => byTeam.get(t.id)!);
    const sum = (pick: (p: (typeof teams)[number]) => number) =>
      teams.reduce((s, p) => s + pick(p), 0);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      plan: companyPlan(c.plan),
      limits: companyLimits(c.plan),
      createdAt: c.createdAt,
      owner: c.owner,
      isOwner: c.ownerId === userId,
      billing: describeCompanyBilling(c),
      teamCount: teams.length,
      memberCount: sum((p) => p.memberCount),
      totalTokens: sum((p) => p.totalTokens),
      windowTokens: sum((p) => p.windowTokens),
    };
  });
  rows.sort((a, b) => b.windowTokens - a.windowTokens);
  return rows;
}

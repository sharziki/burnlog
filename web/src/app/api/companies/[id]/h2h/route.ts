import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { formatTokens } from "@/lib/format";
import { dollarsPerToken } from "@/lib/cost";
import { outcomeOf, verdictOf } from "@/lib/h2h";
import { findTeam, loadCompanyForViewer } from "@/lib/companies";
import { compareTeams } from "@/lib/companyH2h";
import { getTeamBurnProfilesBatch } from "@/lib/companyUsage";

export const dynamic = "force-dynamic";

const DOLLARS_PER_TOKEN = dollarsPerToken();

function formatUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;

  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) return result.key.userId;
  }
  return null;
}

/** GET /api/companies/:id/h2h?a=<team>&b=<team> — team ids or slugs. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId(req);
  const company = await loadCompanyForViewer(id, userId);
  if (!company) return bad(404, "not_found", "no such company");

  const url = new URL(req.url);
  const aRef = url.searchParams.get("a") ?? "";
  const bRef = url.searchParams.get("b") ?? "";
  const a = findTeam(company, aRef);
  const b = findTeam(company, bRef);
  if (!a || !b) return bad(400, "unknown_team", "pass ?a= and ?b= as team ids or slugs");
  if (a.id === b.id) return bad(400, "same_team", "a team can't play itself");

  // Both sides come out of one batched read, so the two teams are always
  // measured over the identical window — fetching them separately would let
  // the day roll over between calls.
  const profiles = await getTeamBurnProfilesBatch([
    { id: a.id, name: a.name, slug: a.slug, memberIds: a.memberIds },
    { id: b.id, name: b.name, slug: b.slug, memberIds: b.memberIds },
  ]);
  const left = profiles.find((p) => p.id === a.id)!;
  const right = profiles.find((p) => p.id === b.id)!;

  const metrics = compareTeams(left, right, formatTokens, (v) => formatUSD(v * DOLLARS_PER_TOKEN));
  const verdict = verdictOf(metrics, left.name, right.name);

  return NextResponse.json({
    ok: true,
    company: { id: company.id, name: company.name, slug: company.slug },
    left: { id: left.id, name: left.name, slug: left.slug, daily: left.daily },
    right: { id: right.id, name: right.name, slug: right.slug, daily: right.daily },
    // Metrics carry formatter functions, which JSON can't hold — render both
    // the raw number and the display string so clients don't reimplement
    // burnlog's formatting and drift from the web UI.
    metrics: metrics.map((m) => ({
      label: m.label,
      hint: m.hint,
      left: m.left,
      right: m.right,
      leftDisplay: m.format(m.left),
      rightDisplay: m.format(m.right),
      unscored: m.unscored === true,
      outcome: outcomeOf(m),
    })),
    verdict,
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { isAdminToken } from "@/lib/adminAuth";

type Body = {
  email?: string;
  name?: string;
  company?: string;
  teamSize?: string;
  useCase?: string;
  source?: string;
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = new Set(["new", "contacted", "qualified", "pilot", "won", "lost"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  if (!isAdminToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = clean(url.searchParams.get("status"), 40);
  const source = clean(url.searchParams.get("source"), 80);
  const where = {
    ...(STATUSES.has(status) ? { status } : {}),
    ...(source ? { source } : {}),
  };
  const leads = await prisma.teamLead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      email: true,
      name: true,
      company: true,
      teamSize: true,
      useCase: true,
      source: true,
      status: true,
      adminNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({ ok: true, leads }, { headers: { "cache-control": "no-store" } });
  }

  const rows = [
    ["email", "name", "company", "teamSize", "useCase", "source", "status", "adminNotes", "createdAt", "updatedAt"],
    ...leads.map((lead) => [
      lead.email,
      lead.name,
      lead.company,
      lead.teamSize,
      lead.useCase,
      lead.source,
      lead.status,
      lead.adminNotes,
      lead.createdAt,
      lead.updatedAt,
    ]),
  ];

  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="burnlog-team-leads.csv"',
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const limit = rateLimit(`team-lead:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const email = clean(body.email, 160).toLowerCase();
  const company = clean(body.company, 100);
  const source = clean(body.source, 80) || "teams_page";

  if (!emailRe.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (!company) {
    return NextResponse.json({ ok: false, error: "company_required" }, { status: 400 });
  }

  await prisma.teamLead.upsert({
    where: { email },
    create: {
      email,
      name: clean(body.name, 80) || null,
      company,
      teamSize: clean(body.teamSize, 40) || null,
      useCase: clean(body.useCase, 500) || null,
      source,
    },
    update: {
      name: clean(body.name, 80) || null,
      company,
      teamSize: clean(body.teamSize, 40) || null,
      useCase: clean(body.useCase, 500) || null,
      source,
      status: "new",
    },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!isAdminToken(req)) return bad(401, "unauthorized");

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    status?: unknown;
    adminNotes?: unknown;
  };
  const email = clean(body.email, 160).toLowerCase();
  const status = clean(body.status, 40);
  const adminNotes = clean(body.adminNotes, 2000);

  if (!emailRe.test(email)) return bad(400, "invalid_email");
  if (!STATUSES.has(status)) return bad(400, "invalid_status");

  const lead = await prisma.teamLead.update({
    where: { email },
    data: { status, adminNotes: adminNotes || null },
    select: { email: true, status: true, adminNotes: true, updatedAt: true },
  }).catch(() => null);

  if (!lead) return bad(404, "not_found");
  return NextResponse.json({ ok: true, lead });
}

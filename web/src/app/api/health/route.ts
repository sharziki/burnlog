import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which commit is serving. CI compares it with the commit it just pushed: a
// deploy that fails leaves the old build up, and the old build passes every
// other check — that hid 23 days of failed deploys.
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, service: "burnlog-web", database: "ok", commit },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: "burnlog-web", database: "down", commit },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

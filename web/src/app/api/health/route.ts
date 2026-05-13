import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: "burnlog-web",
        database: "ok",
        timestamp,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: true,
        service: "burnlog-web",
        database: "degraded",
        timestamp,
      },
      { status: 200 },
    );
  }
}

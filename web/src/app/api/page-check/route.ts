import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMatchupSlug } from "@/lib/h2h";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, message: "database unavailable" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");

  if (kind === "profile") {
    const username = searchParams.get("username")?.trim();
    if (!username) return badRequest("missing username");

    const exists = await prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });

    return NextResponse.json(
      { ok: Boolean(exists) },
      { status: exists ? 200 : 404 },
    );
  }

  if (kind === "matchup") {
    const matchup = searchParams.get("matchup")?.trim();
    if (!matchup) return badRequest("missing matchup");

    const parsed = parseMatchupSlug(matchup);
    if (!parsed) {
      return NextResponse.json({ ok: false, message: "invalid matchup" }, { status: 404 });
    }

    const users = await prisma.user.findMany({
      where: { username: { in: [parsed.left, parsed.right] } },
      select: { username: true },
    });

    return NextResponse.json(
      { ok: users.length === 2 },
      { status: users.length === 2 ? 200 : 404 },
    );
  }

  return badRequest("invalid kind");
}

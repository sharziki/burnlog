import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { searchPeople } from "@/lib/friends";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * People search for the board. Public — the profiles it surfaces are public
 * anyway — but rate limited per IP so it can't be used to enumerate the user
 * table cheaply.
 */
export async function GET(req: Request) {
  const limit = rateLimit(`people:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "slow down" },
      { status: 429 },
    );
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ ok: true, people: [] });
  }

  const session = await auth();
  let meId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!meId && req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) meId = result.key.userId;
  }

  const people = await searchPeople(q, meId);
  return NextResponse.json({ ok: true, people });
}

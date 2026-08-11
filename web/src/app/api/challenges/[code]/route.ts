import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChallenge } from "@/lib/challenges";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const challenge = await getChallenge({ inviteCode: code });
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "no challenge with that code" },
      { status: 404 },
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  return NextResponse.json({
    ok: true,
    challenge,
    joined: userId ? challenge.standings.some((s) => s.userId === userId) : false,
  });
}

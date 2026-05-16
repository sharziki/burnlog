import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/stats";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, message: "database unavailable", users: [] }, { status: 503 });
  }

  const users = await getLeaderboard();
  return NextResponse.json({ users });
}

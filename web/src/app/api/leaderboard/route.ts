import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/stats";

export async function GET() {
  const users = await getLeaderboard();
  return NextResponse.json({ users });
}

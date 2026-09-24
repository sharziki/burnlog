import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBoard } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Your row on the board, for the session in the browser. The home page ships
 * only the top of the board; when you're further down, this is how your own
 * row still shows up pinned beneath it.
 */
export async function GET() {
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)?.username;
  if (!username) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = (await getBoard()).filter((u) => u.totalTokens > 0);
  const byWeek = [...board].sort((a, b) => b.weeklyTokens - a.weeklyTokens);
  const i = board.findIndex((u) => u.username === username);
  if (i < 0) return NextResponse.json({ username, place: null, weekPlace: null, total: board.length });
  const u = board[i];
  return NextResponse.json(
    {
      username,
      total: board.length,
      place: i + 1,
      weekPlace: u.weeklyTokens > 0 ? byWeek.findIndex((x) => x.username === username) + 1 : null,
      row: {
        id: u.id,
        username: u.username,
        name: u.name,
        image: u.image,
        avatar: u.avatar,
        totalTokens: u.totalTokens,
        weeklyTokens: u.weeklyTokens,
        streak: u.streak,
        weeklyHistory: u.weeklyHistory,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

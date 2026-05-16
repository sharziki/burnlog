import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    bio?: string;
    github?: string;
    twitter?: string;
    website?: string;
  };

  const data: Record<string, string | null> = {};
  if ("bio" in body) data.bio = (body.bio ?? "").trim().slice(0, 160) || null;
  if ("github" in body) data.github = (body.github ?? "").trim().slice(0, 39) || null;
  if ("twitter" in body) data.twitter = (body.twitter ?? "").trim().replace(/^@/, "").slice(0, 15) || null;
  if ("website" in body) {
    let w = (body.website ?? "").trim().slice(0, 200);
    if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`;
    data.website = w || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}

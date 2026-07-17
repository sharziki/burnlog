import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/apiKey";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let label = "cli";
  try {
    const body = (await req.json()) as { label?: unknown };
    if (typeof body?.label === "string" && body.label.trim()) {
      label = body.label.trim().slice(0, 40);
    }
  } catch {
    // no body — keep default label
  }

  const { raw, hash } = generateApiKey();
  await prisma.apiKey.create({
    data: { userId, keyHash: hash, label },
  });
  return NextResponse.json({ key: raw });
}

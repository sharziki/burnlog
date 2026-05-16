import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/apiKey";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { raw, hash } = generateApiKey();
  await prisma.$transaction([
    prisma.apiKey.deleteMany({ where: { userId, label: "cli" } }),
    prisma.apiKey.create({
      data: { userId, keyHash: hash, label: "cli" },
    }),
  ]);

  return NextResponse.json({
    key: raw,
    rotated: true,
    message: "New CLI key created. Previous CLI keys were revoked.",
  });
}

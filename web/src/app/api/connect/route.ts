import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hashConnectCode } from "@/lib/connect";

export const runtime = "nodejs";

const TTL_MS = 30 * 60 * 1000;

/**
 * Mint a single-use setup code for the signed-in user. It rides inside the
 * prompt they paste into their agent, so the agent's one command can link the
 * machine to this account without a browser round-trip. Only the hash is
 * stored; the code dies on first use or after 30 minutes.
 */
export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = "blc_" + randomBytes(20).toString("hex");
  const expires = new Date(Date.now() + TTL_MS);
  await prisma.$transaction([
    // Expired codes are dead weight; sweep this user's on the way in.
    prisma.verificationToken.deleteMany({
      where: { identifier: `connect:${userId}`, expires: { lt: new Date() } },
    }),
    prisma.verificationToken.create({
      data: { identifier: `connect:${userId}`, token: hashConnectCode(code), expires },
    }),
  ]);
  return NextResponse.json(
    { code, expiresAt: expires.toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

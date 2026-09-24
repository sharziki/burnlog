import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/apiKey";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashConnectCode } from "@/lib/connect";

export const runtime = "nodejs";

const CODE_RE = /^blc_[0-9a-f]{40}$/;

/** Trade a setup code for an API key. Single use: the code row is deleted in the same step. */
export async function POST(req: Request) {
  const limit = rateLimit(`connect:ip:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { code?: unknown; label?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  const label =
    typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 40) : "agent";

  const token = hashConnectCode(code);
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row || !row.identifier.startsWith("connect:")) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  // Delete first: whoever deletes it owns it, so a code raced twice mints one key.
  const { count } = await prisma.verificationToken.deleteMany({ where: { token } });
  if (count === 0) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  if (row.expires < new Date()) return NextResponse.json({ error: "expired_code" }, { status: 410 });

  const userId = row.identifier.slice("connect:".length);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const { raw, hash } = generateApiKey();
  await prisma.apiKey.create({ data: { userId, keyHash: hash, label } });
  return NextResponse.json({ key: raw, username: user.username }, { headers: { "cache-control": "no-store" } });
}

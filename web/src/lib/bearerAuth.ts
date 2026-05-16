import { NextResponse } from "next/server";
import { prisma } from "./db";
import { hashApiKey } from "./apiKey";
import { rateLimit, clientIp } from "./rateLimit";

export type AuthedKey = {
  id: string;
  userId: string;
  username: string | null;
};

type Fail = { error: NextResponse };
type Ok = { key: AuthedKey };

export async function authFromBearer(
  req: Request,
  opts: { limit: number; windowMs?: number } = { limit: 60, windowMs: 60_000 },
): Promise<Ok | Fail> {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`read:ip:${ip}`, 120, opts.windowMs ?? 60_000);
  if (!ipLimit.ok) {
    return {
      error: NextResponse.json(
        { ok: false, error: "rate_limited", message: "too many requests from this ip" },
        { status: 429 },
      ),
    };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json(
        { ok: false, error: "missing_auth", message: "missing bearer token" },
        { status: 401 },
      ),
    };
  }
  const raw = authHeader.slice("Bearer ".length).trim();
  if (!raw || raw.length > 128) {
    return {
      error: NextResponse.json(
        { ok: false, error: "bad_auth", message: "invalid api key format" },
        { status: 401 },
      ),
    };
  }

  const keyRow = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    select: { id: true, userId: true, user: { select: { username: true } } },
  });
  if (!keyRow) {
    return {
      error: NextResponse.json(
        { ok: false, error: "invalid_key", message: "invalid api key" },
        { status: 401 },
      ),
    };
  }

  const userLimit = rateLimit(
    `read:user:${keyRow.userId}`,
    opts.limit,
    opts.windowMs ?? 60_000,
  );
  if (!userLimit.ok) {
    return {
      error: NextResponse.json(
        { ok: false, error: "rate_limited", message: "too many requests for this user" },
        { status: 429 },
      ),
    };
  }

  // Fire-and-forget lastUsed update.
  prisma.apiKey
    .update({ where: { id: keyRow.id }, data: { lastUsed: new Date() } })
    .catch(() => {});

  return {
    key: { id: keyRow.id, userId: keyRow.userId, username: keyRow.user.username },
  };
}

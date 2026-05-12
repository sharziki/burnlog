import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/apiKey";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { updateStreak } from "@/lib/streak";
import {
  checkRankUp,
  checkOvertake,
  checkMilestone,
  checkStreakMilestone,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngestEvent = {
  requestId: string;
  source: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  timestamp: string;
};

type IngestBody = { events: IngestEvent[] };

// Open source tagging: any lowercase id 1-32 chars of [a-z0-9-]. Keeps
// the column tidy while letting anyone building a new agent pick their own
// tag without a server change.
const SOURCE_RE = /^[a-z0-9-]{1,32}$/;
const ALLOWED_PROVIDERS = new Set(["anthropic", "openai", "google", "other"]);

const MAX_EVENTS_PER_REQUEST = 1000;
const MAX_BODY_BYTES = 1_000_000; // 1 MB
const MAX_STRING_FIELD = 256;

// Per-IP: 120 req/min guards unauthenticated abuse.
// Per-user: 600 req/min — a full sync of years of logs batches to ~dozens
// of requests at 500 events/batch, so 600/min is very forgiving.
const IP_LIMIT = 120;
const USER_LIMIT = 600;
const WINDOW_MS = 60_000;

function err(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: code, message }, { status });
}

function validEvent(e: unknown): e is IngestEvent {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.requestId === "string" &&
    x.requestId.length > 0 &&
    x.requestId.length <= MAX_STRING_FIELD &&
    typeof x.source === "string" &&
    typeof x.model === "string" &&
    x.model.length <= MAX_STRING_FIELD &&
    typeof x.timestamp === "string" &&
    x.timestamp.length <= 64 &&
    Number.isFinite(x.inputTokens) &&
    Number.isFinite(x.outputTokens)
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`ingest:ip:${ip}`, IP_LIMIT, WINDOW_MS);
  if (!ipLimit.ok) {
    return err(429, "rate_limited", "too many requests from this ip");
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return err(401, "missing_auth", "missing bearer token");
  }
  const raw = authHeader.slice("Bearer ".length).trim();
  if (!raw || raw.length > 128) {
    return err(401, "bad_auth", "invalid api key format");
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return err(413, "body_too_large", "request body exceeds 1 MB");
  }

  const keyRow = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    select: { id: true, userId: true, user: { select: { username: true } } },
  });
  if (!keyRow) {
    return err(401, "invalid_key", "invalid api key");
  }

  const userLimit = rateLimit(
    `ingest:user:${keyRow.userId}`,
    USER_LIMIT,
    WINDOW_MS,
  );
  if (!userLimit.ok) {
    return err(429, "rate_limited", "too many requests for this user");
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return err(400, "bad_json", "request body is not valid json");
  }
  if (!body || !Array.isArray(body.events)) {
    return err(400, "bad_shape", "events must be an array");
  }
  if (body.events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });
  }
  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    return err(
      413,
      "too_many_events",
      `max ${MAX_EVENTS_PER_REQUEST} events per request`,
    );
  }

  const now = Date.now();
  const minTs = now - 10 * 365 * 24 * 60 * 60 * 1000; // 10y past
  const maxTs = now + 5 * 60 * 1000; // 5 min skew
  const rows = [];
  let skipped = 0;

  for (const e of body.events) {
    if (!validEvent(e)) {
      skipped++;
      continue;
    }
    if (!SOURCE_RE.test(e.source)) {
      skipped++;
      continue;
    }
    const input = Math.max(0, Math.floor(e.inputTokens));
    const output = Math.max(0, Math.floor(e.outputTokens));
    const cacheCreate = Math.max(0, Math.floor(e.cacheCreationTokens ?? 0));
    const cacheRead = Math.max(0, Math.floor(e.cacheReadTokens ?? 0));
    const total = input + output + cacheCreate + cacheRead;
    if (total <= 0) {
      skipped++;
      continue;
    }
    const ts = Date.parse(e.timestamp);
    if (!Number.isFinite(ts) || ts < minTs || ts > maxTs) {
      skipped++;
      continue;
    }
    const provider = ALLOWED_PROVIDERS.has(e.provider) ? e.provider : "other";

    rows.push({
      userId: keyRow.userId,
      requestId: e.requestId,
      source: e.source,
      model: e.model,
      provider,
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: cacheCreate,
      cacheReadTokens: cacheRead,
      totalTokens: total,
      timestamp: new Date(ts),
    });
  }

  // Snapshot pre-insert totals for notification checks
  let oldTotal = 0;
  let oldStreak = 0;
  if (rows.length) {
    const snap = await prisma.$queryRaw<{ total: bigint; streak: number }[]>`
      SELECT COALESCE(
        (SELECT SUM("totalTokens") FROM "BurnEvent" WHERE "userId" = ${keyRow.userId}), 0
      ) AS total,
      COALESCE(
        (SELECT "currentStreak" FROM "User" WHERE id = ${keyRow.userId}), 0
      ) AS streak
    `;
    if (snap.length > 0) {
      oldTotal = Number(snap[0].total);
      oldStreak = snap[0].streak;
    }
  }

  let inserted = 0;
  if (rows.length) {
    // createMany + skipDuplicates leverages the (userId, source, requestId)
    // unique index. One round-trip instead of N.
    const res = await prisma.burnEvent.createMany({
      data: rows,
      skipDuplicates: true,
    });
    inserted = res.count;
    skipped += rows.length - inserted;
  }

  await prisma.apiKey.update({
    where: { id: keyRow.id },
    data: { lastUsed: new Date() },
  });

  // Recalculate streak after inserting new events
  if (inserted > 0) {
    await updateStreak(keyRow.userId);

    // Fire-and-forget notification checks (non-blocking)
    const newTotal = oldTotal + rows.reduce((s, r) => s + r.totalTokens, 0);
    const user = await prisma.user.findUnique({
      where: { id: keyRow.userId },
      select: { username: true, currentStreak: true },
    });
    const username = user?.username ?? keyRow.user.username ?? "";
    const newStreak = user?.currentStreak ?? 0;

    // Run all checks concurrently, don't await — fire and forget
    void Promise.allSettled([
      checkRankUp(keyRow.userId, oldTotal, newTotal),
      checkOvertake(keyRow.userId, username, newTotal),
      checkMilestone(keyRow.userId, oldTotal, newTotal),
      checkStreakMilestone(keyRow.userId, oldStreak, newStreak),
    ]);
  }

  return NextResponse.json(
    {
      ok: true,
      inserted,
      skipped,
      user: keyRow.user.username,
    },
    {
      headers: {
        "x-ratelimit-limit": String(userLimit.limit),
        "x-ratelimit-remaining": String(userLimit.remaining),
        "x-ratelimit-reset": String(Math.floor(userLimit.resetAt / 1000)),
      },
    },
  );
}

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/apiKey";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { updateStreak } from "@/lib/streak";
import { checkClubBudgetAlerts } from "@/lib/notifications";

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

/**
 * There is no *plausibility* ceiling — an earlier version rejected anything
 * over 5M on the theory that no single call could be that large, and that
 * quietly deleted real burn from the heaviest users. Gaming is answered with
 * attribution and anomaly reporting, not by discarding possibly-genuine data.
 *
 * There IS a hard technical ceiling, and removing it cost us once already.
 * Every read path narrows these columns to a JS `number`, so a value above
 * Number.MAX_SAFE_INTEGER cannot round-trip: it either loses precision
 * silently (a 1e18 event read back 17 tokens light) or, above BIGINT's own
 * limit, throws *inside* createMany and destroys the entire batch — up to
 * 1000 good events lost to one malformed row, with a bare 500.
 *
 * So: reject per event, never per batch.
 */
const MAX_EVENT_TOKENS = Number.MAX_SAFE_INTEGER;

// Per-IP: 120 req/min guards unauthenticated abuse.
// Per-user: 600 req/min — a full sync of years of logs batches to ~dozens
// of requests at 500 events/batch, so 600/min is very forgiving.
const IP_LIMIT = 120;
const USER_LIMIT = 600;
const WINDOW_MS = 60_000;

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}


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
    Number.isFinite(x.outputTokens) &&
    // Cache fields are optional, but if present they must be numbers — an
    // undetected NaN here passes `total <= 0` and throws at insert.
    (x.cacheCreationTokens === undefined || Number.isFinite(x.cacheCreationTokens)) &&
    (x.cacheReadTokens === undefined || Number.isFinite(x.cacheReadTokens))
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
    select: {
      id: true,
      userId: true,
      clubId: true,
      monthlyBudgetTokens: true,
      user: { select: { username: true } },
      club: {
        select: {
          monthlyBudgetTokens: true,
          blockIngestOnBudget: true,
          memberships: { select: { userId: true } },
        },
      },
    },
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
  // Named rejections: `skipped` alone covers six different causes, which made
  // a batch-destroying overflow completely invisible from the client side.
  const rejected: { requestId: string; reason: string }[] = [];
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

    /**
     * `totalTokens` is the ranked number, and it deliberately leaves cache
     * reads out.
     *
     * Counting all four buckets equally made the leaderboard a measure of
     * cached context re-reads rather than work: across every real account on
     * the board, cache reads were 95-99% of the total (one user: 148.3B of
     * 152.4B; another was ranked Quasar on 606M that was really 1.04M of
     * input and output). Every agent turn re-reads the whole cached prompt, so
     * the number grew with session length and told you nothing else. Cache
     * reads are also the cheap path — a tenth the price of fresh input, a
     * fiftieth of output, which is why cost.ts has always priced them apart.
     *
     * Nothing is discarded: cacheReadTokens is still stored per event, still
     * shown in the profile breakdown, and still priced in the cost estimate.
     * It just doesn't decide rank.
     *
     * This is computed server-side rather than trusted from the payload, so
     * every CLI version — including ones already installed — lands on the same
     * definition without needing to upgrade.
     */
    const counted = input + output + cacheCreate;

    // The "is there anything here" and overflow checks stay on the gross sum.
    // An event that is *only* a cache read still has to be stored: dropping it
    // would lose the bucket the profile breakdown and the cost estimate read
    // from, and would let the same requestId be re-ingested forever.
    const gross = input + output + cacheCreate + cacheRead;
    if (gross <= 0) {
      skipped++;
      continue;
    }
    const total = counted;

    // Skip the single unstorable event, never the batch.
    if (
      gross > MAX_EVENT_TOKENS ||
      input > MAX_EVENT_TOKENS ||
      output > MAX_EVENT_TOKENS ||
      cacheCreate > MAX_EVENT_TOKENS ||
      cacheRead > MAX_EVENT_TOKENS
    ) {
      skipped++;
      rejected.push({
        requestId: e.requestId.slice(0, 64),
        reason: `event exceeds ${MAX_EVENT_TOKENS.toLocaleString()} tokens — split it`,
      });
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
      clubId: keyRow.clubId,
      apiKeyId: keyRow.id,
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

  if (
    keyRow.clubId &&
    keyRow.monthlyBudgetTokens > 0 &&
    rows.length
  ) {
    const monthStart = monthStartUtc();
    const keyUsage = await prisma.burnEvent.aggregate({
      where: { apiKeyId: keyRow.id, timestamp: { gte: monthStart } },
      _sum: { totalTokens: true },
    });
    const currentMonthly = Number(keyUsage._sum.totalTokens ?? 0);
    const incoming = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    if (currentMonthly + incoming > keyRow.monthlyBudgetTokens) {
      return err(
        402,
        "api_key_budget_exceeded",
        "team api key monthly budget would be exceeded; ingest rejected",
      );
    }
  }

  if (
    keyRow.clubId &&
    keyRow.club?.blockIngestOnBudget &&
    keyRow.club.monthlyBudgetTokens > 0 &&
    rows.length
  ) {
    const monthStart = monthStartUtc();
    const memberIds = keyRow.club.memberships.map((m) => m.userId);
    const [memberUsage, serviceUsage] = await Promise.all([
      memberIds.length
        ? prisma.burnEvent.aggregate({
            where: { userId: { in: memberIds }, clubId: null, timestamp: { gte: monthStart } },
            _sum: { totalTokens: true },
          })
        : null,
      prisma.burnEvent.aggregate({
        where: { clubId: keyRow.clubId, timestamp: { gte: monthStart } },
        _sum: { totalTokens: true },
      }),
    ]);
    const currentMonthly =
      Number(memberUsage?._sum.totalTokens ?? 0) + Number(serviceUsage._sum.totalTokens ?? 0);
    const incoming = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    if (currentMonthly + incoming > keyRow.club.monthlyBudgetTokens) {
      return err(
        402,
        "budget_exceeded",
        "team monthly budget would be exceeded; ingest rejected",
      );
    }
  }

  let inserted = 0;
  let grown = 0;
  if (rows.length) {
    // One statement on the (userId, source, requestId) unique index. A new id
    // inserts. A repeated id with a *larger* total replaces the row: adapters
    // that report one running total per session (codex, hermes, goose, droid,
    // ...) send the same id again as the session grows, and the old
    // skipDuplicates kept whatever the first sync happened to see. Never
    // shrinks, so an identical or partial re-send is a no-op.
    const values = rows.map(
      (r) => Prisma.sql`(gen_random_uuid()::text, ${r.userId}, ${r.clubId}, ${r.apiKeyId}, ${r.requestId},
        ${r.source}, ${r.model}, ${r.provider}, ${BigInt(r.inputTokens)}, ${BigInt(r.outputTokens)},
        ${BigInt(r.cacheCreationTokens)}, ${BigInt(r.cacheReadTokens)}, ${BigInt(r.totalTokens)}, ${r.timestamp})`,
    );
    const res = await prisma.$queryRaw<{ fresh: boolean }[]>`
      INSERT INTO "BurnEvent" (id, "userId", "clubId", "apiKeyId", "requestId", source, model, provider,
        "inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "totalTokens", timestamp)
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("userId", source, "requestId") DO UPDATE SET
        model = EXCLUDED.model,
        provider = EXCLUDED.provider,
        "inputTokens" = EXCLUDED."inputTokens",
        "outputTokens" = EXCLUDED."outputTokens",
        "cacheCreationTokens" = EXCLUDED."cacheCreationTokens",
        "cacheReadTokens" = EXCLUDED."cacheReadTokens",
        "totalTokens" = EXCLUDED."totalTokens",
        timestamp = EXCLUDED.timestamp
      WHERE EXCLUDED."totalTokens" + EXCLUDED."cacheReadTokens"
          > "BurnEvent"."totalTokens" + "BurnEvent"."cacheReadTokens"
      RETURNING (xmax = 0) AS fresh`;
    inserted = res.filter((r) => r.fresh).length;
    grown = res.length - inserted;
    skipped += rows.length - res.length;
  }

  await prisma.apiKey.update({
    where: { id: keyRow.id },
    data: { lastUsed: new Date() },
  });

  // Recalculate streak after inserting new events
  if (inserted + grown > 0) {
    await updateStreak(keyRow.userId);

    // Club budget webhooks remain available to connected teams.
    void checkClubBudgetAlerts(keyRow.userId);
  }

  return NextResponse.json(
    {
      ok: true,
      inserted,
      updated: grown,
      skipped,
      ...(rejected.length ? { rejected: rejected.slice(0, 20) } : {}),
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

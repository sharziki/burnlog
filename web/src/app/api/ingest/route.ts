import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/apiKey";

type IngestEvent = {
  requestId: string;
  sessionId: string;
  project: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  timestamp: string; // ISO
};

type IngestBody = {
  events: IngestEvent[];
};

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 });
  }
  const raw = auth.slice("Bearer ".length).trim();
  const keyRow = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { user: true },
  });
  if (!keyRow) {
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: "events must be array" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;

  // createMany on SQLite doesn't support skipDuplicates pre-6.x reliably in
  // older prisma; do per-row upserts to be safe and get accurate counts.
  for (const e of body.events) {
    if (!e.requestId || !e.sessionId || !e.project) {
      skipped++;
      continue;
    }
    const total =
      (e.inputTokens ?? 0) +
      (e.outputTokens ?? 0) +
      (e.cacheCreationTokens ?? 0) +
      (e.cacheReadTokens ?? 0);
    const result = await prisma.burnEvent.upsert({
      where: { userId_requestId: { userId: keyRow.userId, requestId: e.requestId } },
      create: {
        userId: keyRow.userId,
        requestId: e.requestId,
        sessionId: e.sessionId,
        project: e.project,
        model: e.model ?? "unknown",
        provider: e.provider ?? "anthropic",
        inputTokens: e.inputTokens ?? 0,
        outputTokens: e.outputTokens ?? 0,
        cacheCreationTokens: e.cacheCreationTokens ?? 0,
        cacheReadTokens: e.cacheReadTokens ?? 0,
        totalTokens: total,
        timestamp: new Date(e.timestamp),
      },
      update: {}, // idempotent — never overwrite
      select: { createdAt: true },
    });
    // upsert doesn't tell us insert vs update directly; check createdAt recency
    if (Date.now() - result.createdAt.getTime() < 5000) inserted++;
    else skipped++;
  }

  await prisma.apiKey.update({
    where: { id: keyRow.id },
    data: { lastUsed: new Date() },
  });

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    user: keyRow.user.username,
  });
}

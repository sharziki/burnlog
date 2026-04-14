import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/apiKey";

type IngestEvent = {
  requestId: string;
  source: string; // "claude-code" | "codex" | "hermes" | "openclaw"
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

const ALLOWED_SOURCES = new Set([
  "claude-code",
  "codex",
  "hermes",
  "openclaw",
  "anthropic-api",
  "openai-api",
]);

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

  for (const e of body.events) {
    if (!e.requestId || !e.source || !e.model) {
      skipped++;
      continue;
    }
    if (!ALLOWED_SOURCES.has(e.source)) {
      skipped++;
      continue;
    }
    const total =
      (e.inputTokens ?? 0) +
      (e.outputTokens ?? 0) +
      (e.cacheCreationTokens ?? 0) +
      (e.cacheReadTokens ?? 0);
    if (total <= 0) {
      skipped++;
      continue;
    }

    const existing = await prisma.burnEvent.findUnique({
      where: {
        userId_source_requestId: {
          userId: keyRow.userId,
          source: e.source,
          requestId: e.requestId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.burnEvent.create({
      data: {
        userId: keyRow.userId,
        requestId: e.requestId,
        source: e.source,
        model: e.model,
        provider: e.provider ?? "other",
        inputTokens: e.inputTokens ?? 0,
        outputTokens: e.outputTokens ?? 0,
        cacheCreationTokens: e.cacheCreationTokens ?? 0,
        cacheReadTokens: e.cacheReadTokens ?? 0,
        totalTokens: total,
        timestamp: new Date(e.timestamp),
      },
    });
    inserted++;
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

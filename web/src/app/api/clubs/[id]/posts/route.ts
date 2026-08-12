import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authFromBearer } from "@/lib/bearerAuth";
import { prisma } from "@/lib/db";
import { SUGGESTED_TAGS } from "@/lib/clubTopics";

export const dynamic = "force-dynamic";

const MAX_TITLE = 120;
const MAX_BODY = 8000;
const MAX_TAGS = 5;

async function currentUserId(req: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) return sessionUserId;
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    const result = await authFromBearer(req);
    if ("key" in result) return result.key.userId;
  }
  return null;
}

/** Private clubs are members-only; public clubs are readable by anyone. */
async function canRead(clubId: string, userId: string | null) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, isPrivate: true, memberships: { select: { userId: true } } },
  });
  if (!club) return { ok: false as const, status: 404, isMember: false };
  const isMember = Boolean(userId && club.memberships.some((m) => m.userId === userId));
  if (club.isPrivate && !isMember) return { ok: false as const, status: 403, isMember };
  return { ok: true as const, status: 200, isMember };
}

function normalizeTags(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const tags = raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean)
    .slice(0, MAX_TAGS);
  return tags.length ? [...new Set(tags)].join(",") : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await currentUserId(req);
  const access = await canRead(id, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: "no_access" }, { status: access.status });
  }

  const tag = new URL(req.url).searchParams.get("tag");

  const posts = await prisma.clubPost.findMany({
    where: { clubId: id, ...(tag ? { tags: { contains: tag } } : {}) },
    include: {
      author: { select: { username: true, name: true, image: true } },
      replies: {
        include: { author: { select: { username: true, name: true, image: true } } },
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
    // Pinned first, then newest — the club's own reading order.
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    isMember: access.isMember,
    suggestedTags: SUGGESTED_TAGS,
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      tags: p.tags ? p.tags.split(",") : [],
      pinned: p.pinned,
      createdAt: p.createdAt.toISOString(),
      author: p.author,
      replies: p.replies.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        author: r.author,
      })),
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await currentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "sign in to post" },
      { status: 401 },
    );
  }

  // Posting always requires membership, even in a public club — otherwise
  // public clubs become an open message board for anyone on the internet.
  const membership = await prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId: id, userId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "not_member", message: "join the club to post" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // A reply carries postId; anything else is a new post.
  const replyTo = typeof body.postId === "string" ? body.postId : null;
  const text = String(body.body ?? "").trim();
  if (!text || text.length > MAX_BODY) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: `body must be 1-${MAX_BODY} chars` },
      { status: 400 },
    );
  }

  if (replyTo) {
    const parent = await prisma.clubPost.findFirst({
      where: { id: replyTo, clubId: id },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ ok: false, error: "no_post" }, { status: 404 });
    }
    const reply = await prisma.clubPostReply.create({
      data: { postId: replyTo, authorId: userId, body: text },
    });
    return NextResponse.json({ ok: true, replyId: reply.id }, { status: 201 });
  }

  const title = String(body.title ?? "").trim().slice(0, MAX_TITLE) || null;
  const post = await prisma.clubPost.create({
    data: {
      clubId: id,
      authorId: userId,
      title,
      body: text,
      tags: normalizeTags(body.tags),
    },
  });
  return NextResponse.json({ ok: true, postId: post.id }, { status: 201 });
}

import { prisma } from "./db";
import { getUserStats, type UserStats } from "./stats";

export type GroupSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  inviteCode: string;
  memberCount: number;
  totalTokens: number;
  captain: string | null;
  topOperator: UserStats | null;
};

export type ChallengeSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  inviteCode: string;
  startsAt: Date;
  endsAt: Date;
  participantCount: number;
  hostGroup: { slug: string; name: string } | null;
  leader: { username: string; tokens: number } | null;
};

export type ChallengeBoardRow = {
  user: UserStats;
  tokens: number;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

async function uniqueSlug(model: "group" | "challenge", base: string): Promise<string> {
  const root = slugify(base) || `${model}-${Date.now()}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing =
      model === "group"
        ? await prisma.group.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await prisma.challenge.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now()}`;
}

async function uniqueInviteCode(model: "group" | "challenge"): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomCode(model === "group" ? "GRP" : "CHL");
    const existing =
      model === "group"
        ? await prisma.group.findUnique({ where: { inviteCode: code }, select: { id: true } })
        : await prisma.challenge.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  return randomCode(model === "group" ? "GRP" : "CHL");
}

async function sumTokensForUsers(userIds: string[], startsAt?: Date, endsAt?: Date): Promise<Map<string, number>> {
  const rows = await prisma.burnEvent.findMany({
    where: {
      userId: { in: userIds },
      ...(startsAt || endsAt
        ? {
            timestamp: {
              ...(startsAt ? { gte: startsAt } : {}),
              ...(endsAt ? { lte: endsAt } : {}),
            },
          }
        : {}),
    },
    select: { userId: true, totalTokens: true },
  });

  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.totalTokens);
  return totals;
}

export async function getGroups(): Promise<GroupSummary[]> {
  const groups = await prisma.group.findMany({
    include: {
      createdBy: { select: { username: true } },
      memberships: { select: { userId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    groups.map(async (group) => {
      const userIds = group.memberships.map((item) => item.userId);
      const totals = await sumTokensForUsers(userIds);
      const totalTokens = [...totals.values()].reduce((sum, value) => sum + value, 0);
      const topUserId = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const topOperator = topUserId ? await getUserStats(topUserId) : null;
      return {
        id: group.id,
        slug: group.slug,
        name: group.name,
        description: group.description,
        inviteCode: group.inviteCode,
        memberCount: group.memberships.length,
        totalTokens,
        captain: group.createdBy.username ?? null,
        topOperator,
      };
    }),
  );
}

export async function getGroupsForUser(userId: string): Promise<GroupSummary[]> {
  const memberships = await prisma.groupMembership.findMany({ where: { userId }, select: { groupId: true } });
  const all = await getGroups();
  const ids = new Set(memberships.map((item) => item.groupId));
  return all.filter((group) => ids.has(group.id));
}

export async function getGroupBySlug(slug: string) {
  const group = await prisma.group.findUnique({
    where: { slug },
    include: {
      createdBy: { select: { username: true, name: true } },
      memberships: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
      challenges: {
        select: { id: true, slug: true, title: true, status: true, endsAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!group) return null;

  const members = await Promise.all(group.memberships.map(async (item) => ({
    role: item.role,
    user: await getUserStats(item.user.id),
  })));

  const rankedMembers = members
    .filter((item): item is { role: string; user: UserStats } => item.user !== null)
    .sort((a, b) => b.user.totalTokens - a.user.totalTokens);

  return {
    ...group,
    rankedMembers,
  };
}

export async function getChallenges(): Promise<ChallengeSummary[]> {
  const challenges = await prisma.challenge.findMany({
    include: {
      hostGroup: { select: { slug: true, name: true } },
      entries: { select: { userId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    challenges.map(async (challenge) => {
      const userIds = challenge.entries.map((item) => item.userId);
      const totals = userIds.length ? await sumTokensForUsers(userIds, challenge.startsAt, challenge.endsAt) : new Map<string, number>();
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      let leader: { username: string; tokens: number } | null = null;
      if (top) {
        const user = await prisma.user.findUnique({ where: { id: top[0] }, select: { username: true } });
        if (user?.username) leader = { username: user.username, tokens: top[1] };
      }
      return {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        summary: challenge.summary,
        status: challenge.status,
        inviteCode: challenge.inviteCode,
        startsAt: challenge.startsAt,
        endsAt: challenge.endsAt,
        participantCount: challenge.entries.length,
        hostGroup: challenge.hostGroup,
        leader,
      };
    }),
  );
}

export async function getChallengeBySlug(slug: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { slug },
    include: {
      createdBy: { select: { username: true, name: true } },
      hostGroup: { select: { slug: true, name: true } },
      entries: { select: { userId: true } },
    },
  });
  if (!challenge) return null;

  const userIds = challenge.entries.map((item) => item.userId);
  const totals = userIds.length ? await sumTokensForUsers(userIds, challenge.startsAt, challenge.endsAt) : new Map<string, number>();
  const board = (
    await Promise.all(
      userIds.map(async (userId) => {
        const user = await getUserStats(userId);
        if (!user) return null;
        return { user, tokens: totals.get(userId) ?? 0 };
      }),
    )
  )
    .filter((row): row is ChallengeBoardRow => row !== null)
    .sort((a, b) => b.tokens - a.tokens);

  return {
    ...challenge,
    board,
  };
}

export async function createGroup(input: { userId: string; name: string; description?: string | null }) {
  const slug = await uniqueSlug("group", input.name);
  const inviteCode = await uniqueInviteCode("group");
  return prisma.group.create({
    data: {
      slug,
      name: input.name,
      description: input.description,
      inviteCode,
      createdById: input.userId,
      memberships: {
        create: [{ userId: input.userId, role: "owner" }],
      },
    },
  });
}

export async function joinGroupByCode(input: { userId: string; inviteCode: string }) {
  const group = await prisma.group.findUnique({ where: { inviteCode: input.inviteCode.trim().toUpperCase() } });
  if (!group) return null;
  await prisma.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId: input.userId } },
    update: {},
    create: { groupId: group.id, userId: input.userId },
  });
  return group;
}

export async function createChallenge(input: {
  userId: string;
  title: string;
  summary?: string | null;
  hostGroupId?: string | null;
  startsAt: Date;
  endsAt: Date;
}) {
  const slug = await uniqueSlug("challenge", input.title);
  const inviteCode = await uniqueInviteCode("challenge");
  const challenge = await prisma.challenge.create({
    data: {
      slug,
      title: input.title,
      summary: input.summary,
      inviteCode,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdById: input.userId,
      hostGroupId: input.hostGroupId ?? null,
    },
  });

  const participantIds = input.hostGroupId
    ? (
        await prisma.groupMembership.findMany({ where: { groupId: input.hostGroupId }, select: { userId: true } })
      ).map((item) => item.userId)
    : [input.userId];

  await prisma.challengeEntry.createMany({
    data: [...new Set(participantIds)].map((userId) => ({ challengeId: challenge.id, userId })),
  });

  return challenge;
}

export async function joinChallengeByCode(input: { userId: string; inviteCode: string }) {
  const challenge = await prisma.challenge.findUnique({ where: { inviteCode: input.inviteCode.trim().toUpperCase() } });
  if (!challenge) return null;
  await prisma.challengeEntry.upsert({
    where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } },
    update: {},
    create: { challengeId: challenge.id, userId: input.userId },
  });
  return challenge;
}

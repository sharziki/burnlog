import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const users = [
  ["sharziki", "Sharvil Saxena", "building @ sxna labs. ai-native."],
  ["maya-ops", "Maya Chen", "platform engineering lead tracking agent cost."],
  ["devin-finops", "Devin Patel", "finops for AI coding teams."],
  ["rio-agent", "Rio Morgan", "agent infra and eval loops."],
] as const;

const events = [
  ["sharziki", "codex", "gpt-5-codex", "openai", 940000, 260000, 0],
  ["sharziki", "claude-code", "claude-opus-4-6", "anthropic", 740000, 210000, 1],
  ["maya-ops", "claude-code", "claude-sonnet-4-5", "anthropic", 620000, 180000, 2],
  ["maya-ops", "codex", "gpt-5-codex", "openai", 280000, 90000, 4],
  ["devin-finops", "codex", "gpt-5-codex", "openai", 380000, 120000, 3],
  ["devin-finops", "openai-api", "gpt-5", "openai", 210000, 70000, 8],
  ["rio-agent", "claude-code", "claude-sonnet-4-5", "anthropic", 240000, 80000, 6],
  ["rio-agent", "anthropic-api", "claude-haiku-4-5", "anthropic", 120000, 30000, 11],
] as const;

async function main() {
  const byUsername = new Map<string, string>();

  for (const [username, name, bio] of users) {
    const user = await prisma.user.upsert({
      where: { username },
      update: { name, bio, github: username },
      create: {
        username,
        name,
        bio,
        github: username,
        email: `${username}@local.burnlog`,
      },
    });
    byUsername.set(username, user.id);
  }

  const club = await prisma.club.upsert({
    where: { slug: "sxna-ai-platform" },
    update: {
      name: "SXNA AI Platform",
      description: "Internal AI coding cost and throughput leaderboard.",
      monthlyBudgetTokens: 5_000_000,
    },
    create: {
      name: "SXNA AI Platform",
      slug: "sxna-ai-platform",
      description: "Internal AI coding cost and throughput leaderboard.",
      monthlyBudgetTokens: 5_000_000,
      ownerId: byUsername.get("sharziki")!,
    },
  });

  const privateClub = await prisma.club.upsert({
    where: { slug: "sxna-finops" },
    update: {
      name: "SXNA FinOps",
      description: "Private AI spend review workspace.",
      isPrivate: true,
      inviteCode: "seed-invite",
      monthlyBudgetTokens: 2_000_000,
    },
    create: {
      name: "SXNA FinOps",
      slug: "sxna-finops",
      description: "Private AI spend review workspace.",
      isPrivate: true,
      inviteCode: "seed-invite",
      monthlyBudgetTokens: 2_000_000,
      ownerId: byUsername.get("sharziki")!,
    },
  });

  for (const userId of byUsername.values()) {
    await prisma.clubMembership.upsert({
      where: { clubId_userId: { clubId: club.id, userId } },
      update: {},
      create: { clubId: club.id, userId },
    });
  }
  await prisma.clubMembership.upsert({
    where: { clubId_userId: { clubId: privateClub.id, userId: byUsername.get("sharziki")! } },
    update: {},
    create: { clubId: privateClub.id, userId: byUsername.get("sharziki")! },
  });

  const now = Date.now();
  await prisma.burnEvent.createMany({
    skipDuplicates: true,
    data: events.map(([username, source, model, provider, inputTokens, outputTokens, daysAgo], i) => ({
      userId: byUsername.get(username)!,
      requestId: `seed-${username}-${source}-${i}`,
      source,
      model,
      provider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
    })),
  });

  console.log(`Seeded ${users.length} users, ${events.length} events, 2 clubs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

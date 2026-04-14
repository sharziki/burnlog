// Local dev helper: create a user + API key without going through GitHub OAuth.
// Usage: cd web && npx tsx prisma/bootstrap.ts sharziki "Sharvil Saxena"
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

function generateApiKey() {
  const raw = "blg_" + randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

async function main() {
  const username = process.argv[2] ?? "sharziki";
  const name = process.argv[3] ?? "Sharvil Saxena";
  const bio = process.argv[4] ?? "building @ sxna labs. ai-native.";

  const user = await prisma.user.upsert({
    where: { username },
    update: { name, bio },
    create: { username, name, bio, email: `${username}@local.burnlog` },
  });

  const { raw, hash } = generateApiKey();
  await prisma.apiKey.create({
    data: { userId: user.id, keyHash: hash, label: "bootstrap" },
  });

  console.log(JSON.stringify({ username: user.username, userId: user.id, apiKey: raw }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

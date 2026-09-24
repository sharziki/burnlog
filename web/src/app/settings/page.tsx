import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { SettingsClient, type Machine } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
  } | undefined;

  if (user?.id) {
    // The public profile fields live on User; settings is where they're edited.
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { bio: true, twitter: true, website: true },
    });
    const profile = {
      bio: row?.bio ?? "",
      twitter: row?.twitter ?? "",
      website: row?.website ?? "",
    };

    // Each personal API key is a machine: `connect` labels it with the
    // hostname. Tokens per key come from the events it uploaded.
    const [keys, perKey] = await Promise.all([
      prisma.apiKey.findMany({
        where: { userId: user.id, clubId: null },
        select: { id: true, label: true, createdAt: true, lastUsed: true },
        orderBy: [{ lastUsed: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      prisma.burnEvent.groupBy({
        by: ["apiKeyId"],
        where: { userId: user.id, apiKeyId: { not: null } },
        _sum: { totalTokens: true },
      }),
    ]);
    const tokensByKey = new Map(perKey.map((r) => [r.apiKeyId, Number(r._sum.totalTokens ?? 0)]));
    const machines: Machine[] = keys.map((k) => ({
      id: k.id,
      label: k.label && k.label !== "cli" && k.label !== "agent" ? k.label : "Machine",
      createdAt: k.createdAt.toISOString(),
      lastUsed: k.lastUsed?.toISOString() ?? null,
      tokens: tokensByKey.get(k.id) ?? 0,
    }));
    const userId = user.id;

    async function signOutAction() {
      "use server";
      await signOut({ redirectTo: "/" });
    }

    // Disconnect = delete the key. Its burn history stays (the events' key
    // reference is SET NULL), so the board doesn't change; the machine just
    // can't upload again until it's reconnected.
    async function disconnectAction(id: string) {
      "use server";
      await prisma.apiKey.deleteMany({ where: { id, userId, clubId: null } });
      revalidatePath("/settings");
    }

    return (
      <SettingsClient
        username={user.username ?? "user"}
        name={user.name ?? user.username ?? "burnlog user"}
        image={user.image ?? null}
        profile={profile}
        signOutAction={signOutAction}
        machines={machines}
        disconnectAction={disconnectAction}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-5 px-5 text-center">
      <p className="m-0 text-[13px] text-dim">burnlog · sign in</p>
      <form
        action={async () => {
          "use server";
          await signIn("github");
        }}
      >
        <button type="submit" className="btn btn-primary">
          Sign in with GitHub
        </button>
      </form>
    </main>
  );
}

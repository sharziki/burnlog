import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "./client";

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

    async function signOutAction() {
      "use server";
      await signOut({ redirectTo: "/" });
    }

    return (
      <SettingsClient
        username={user.username ?? "user"}
        name={user.name ?? user.username ?? "burnlog user"}
        image={user.image ?? null}
        profile={profile}
        signOutAction={signOutAction}
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

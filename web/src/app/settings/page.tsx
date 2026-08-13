import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "./client";
import { isFullSurface } from "@/lib/surface";

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
      select: { bio: true, github: true, twitter: true, website: true },
    });
    const profile = {
      bio: row?.bio ?? "",
      github: row?.github ?? "",
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
        full={isFullSurface()}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        fontFamily: 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#52525B",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        burnlog · sign in
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("github");
        }}
      >
        <button
          type="submit"
          style={{
            padding: "12px 24px",
            background: "#D97706",
            color: "#09090B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
          }}
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  );
}

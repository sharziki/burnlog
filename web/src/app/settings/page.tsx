import { auth, signOut } from "@/auth";
import { getUserStats } from "@/lib/stats";
import { redirect } from "next/navigation";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as
    | { id?: string; username?: string; name?: string; image?: string | null }
    | undefined;

  if (!user?.id) {
    redirect("/login?next=%2Fsettings");
  }

  const stats = await getUserStats(user.id);
  const usage = stats
    ? {
        totalTokens: stats.totalTokens,
        weeklyTokens: stats.weeklyTokens,
        events: stats.commits,
        lastActive: stats.lastActive,
        hasSyncedData: stats.commits > 0,
      }
    : {
        totalTokens: 0,
        weeklyTokens: 0,
        events: 0,
        lastActive: null,
        hasSyncedData: false,
      };

  return (
    <SettingsClient
      username={user.username ?? "anon"}
      name={user.name ?? user.username ?? "burnlog user"}
      image={user.image ?? null}
      usage={usage}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    />
  );
}

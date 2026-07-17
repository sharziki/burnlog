import { getLeaderboard } from "@/lib/stats";
import { Burnlog } from "@/components/Burnlog";
import { auth, signIn, signOut } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const users = await getLeaderboard();
  const session = await auth();
  const currentUsername =
    (session?.user as { username?: string } | undefined)?.username ?? null;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  async function signInAction() {
    "use server";
    await signIn("github");
  }

  return (
    <Burnlog
      users={users}
      currentUsername={currentUsername}
      signOutAction={currentUsername ? signOutAction : undefined}
      signInAction={!currentUsername ? signInAction : undefined}
    />
  );
}

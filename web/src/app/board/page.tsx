import { getLeaderboard } from "@/lib/stats";
import { Burnlog } from "@/components/Burnlog";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const users = await getLeaderboard();
  const session = await auth();
  const currentUsername = (session?.user as { username?: string } | undefined)?.username ?? null;

  return <Burnlog users={users} currentUsername={currentUsername} />;
}

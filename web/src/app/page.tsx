import { auth } from "@/auth";
import { LandingPage } from "@/components/LandingPage";
import { buildLandingSnapshot } from "@/lib/landing";
import { getLeaderboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [users, session] = await Promise.all([getLeaderboard(), auth()]);
  const currentUsername = (session?.user as { username?: string } | undefined)?.username ?? null;

  return <LandingPage currentUsername={currentUsername} snapshot={buildLandingSnapshot(users)} />;
}

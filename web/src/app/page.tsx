import { auth } from "@/auth";
import { LandingPage } from "@/components/LandingPage";
import { getChallenges, getGroups } from "@/lib/community";
import { buildLandingSnapshot } from "@/lib/landing";
import { getLeaderboard } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [users, groups, challenges, session] = await Promise.all([getLeaderboard(), getGroups(), getChallenges(), auth()]);
  const currentUsername = (session?.user as { username?: string } | undefined)?.username ?? null;

  return <LandingPage currentUsername={currentUsername} snapshot={buildLandingSnapshot(users, groups, challenges)} />;
}

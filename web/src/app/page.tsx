import { getBoard } from "@/lib/stats";
import { Burnlog } from "@/components/Burnlog";
import { auth, signIn, signOut } from "@/auth";
import { isFullSurface } from "@/lib/surface";
import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

// Title and description come from the layout — this is the page they were
// written for. The canonical is the point: burnlog.net is reachable as three
// Vercel aliases, and without this every one of them is a duplicate of the home
// page competing with it.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const users = await getBoard();
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
    <>
      {/* The FAQ only renders for signed-out visitors, which is exactly who a
          crawler is — so the schema ships with it, never without it. */}
      {!currentUsername && <FaqJsonLd />}
      <Burnlog
        users={users}
        currentUsername={currentUsername}
        signOutAction={currentUsername ? signOutAction : undefined}
        signInAction={!currentUsername ? signInAction : undefined}
        full={isFullSurface()}
      />
    </>
  );
}

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)?.username;
  if (username) redirect(`/u/${encodeURIComponent(username)}${account === "1" ? "#account" : ""}`);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-5 px-5 text-center">
      <h1 className="m-0 font-display text-[32px] text-ink">Your profile</h1>
      <p className="m-0 text-[14px] text-soft">Sign in to see your tokens and manage your account.</p>
      <form action={async () => {
        "use server";
        await signIn("github", { redirectTo: account === "1" ? "/me?account=1" : "/me" });
      }}>
        <button type="submit" className="btn btn-primary">Sign in with GitHub</button>
      </form>
    </main>
  );
}

import { auth, signOut } from "@/auth";
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

  return (
    <SettingsClient
      username={user.username ?? "anon"}
      name={user.name ?? user.username ?? "burnlog user"}
      image={user.image ?? null}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    />
  );
}

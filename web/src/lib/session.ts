import { auth } from "@/auth";

export async function requireCurrentUser() {
  const session = await auth();
  const user = session?.user as { id?: string; username?: string; name?: string } | undefined;
  if (!user?.id) return null;
  return user;
}

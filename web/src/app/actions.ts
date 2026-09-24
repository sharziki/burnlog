"use server";

import { signIn } from "@/auth";

export async function signInWithGitHub(): Promise<void> {
  await signIn("github", { redirectTo: "/" });
}

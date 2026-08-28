import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login,
          bio: profile.bio ?? null,
        };
      },
    }),
  ],
  // GitHub is the only way in, so there is nothing to pick and no reason for a
  // sign-in screen: every button in the app calls signIn("github") and lands on
  // GitHub itself. `signIn` points at the home page purely to replace Auth.js's
  // stock provider-picker — the one place someone could otherwise arrive at an
  // unstyled white page with a single button on it.
  //
  // The error page is the one that has to exist: an ordinary failure — someone
  // declining GitHub's consent screen, an expired code — rendered as
  // "Configuration" under an HTTP 500 before this.
  pages: { signIn: "/", error: "/auth/error" },
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id?: string }).id = user.id;
        (session.user as { username?: string }).username =
          (user as unknown as { username?: string }).username ?? undefined;
      }
      return session;
    },
  },
  trustHost: true,
});

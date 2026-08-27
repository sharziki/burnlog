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
  // Both replace stock Auth.js screens, which are unstyled white pages served
  // in the middle of a dark site. The error page is the one that matters:
  // every ordinary sign-in failure — declining GitHub's consent screen, an
  // expired code — rendered as "Configuration" under an HTTP 500.
  pages: { signIn: "/signin", error: "/auth/error" },
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

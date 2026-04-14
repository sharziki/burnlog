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

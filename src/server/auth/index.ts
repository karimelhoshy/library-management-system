import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/server/db";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";
import { isDemoMode, isGoogleAuthEnabled } from "@/server/env";
import { isDemoUserId } from "./demo-users";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

function providers(): Provider[] {
  const list: Provider[] = [];
  if (isGoogleAuthEnabled()) list.push(Google);
  // "Demo" sign-in: switches the real session to a seeded demo user by id.
  // It refuses everything unless DEMO_MODE=true and the id belongs to a demo account.
  list.push(
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: { userId: { type: "text" } },
      async authorize(credentials) {
        if (!isDemoMode()) return null;
        const userId = typeof credentials?.userId === "string" ? credentials.userId : "";
        if (!isDemoUserId(userId)) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(and(eq(users.id, userId), eq(users.isDemo, true)));
        if (!user) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  );
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Credentials sign-in requires JWT sessions. The role is read fresh from the
  // database on every request (see getCurrentUser), so role changes apply at once.
  session: { strategy: "jwt" },
  providers: providers(),
  pages: { signIn: "/sign-in", error: "/sign-in" },
  trustHost: true,
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getInstance } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isUserLocked, loginSchema, nextLoginAttemptState, resolveRole, verifyPassword } from "@/lib/domain/auth";
import { USER_ROLE, type UserRole } from "@/lib/config/auth";
import { AUTH_ROUTES } from "@/lib/config/routes";

// Functional config pattern — DrizzleAdapter(getInstance()) is only called on the
// first actual request, never at module evaluation time. This prevents Next.js build
// from throwing when DATABASE_URL is absent in the CI/build environment.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getInstance();
  return {
    adapter: DrizzleAdapter(db),
    session: { strategy: "jwt" },
    pages: {
      signIn: AUTH_ROUTES.login,
      error: AUTH_ROUTES.login,
    },
    providers: [
      // Only register Google when actually configured — an unconfigured
      // provider still shows up on the NextAuth sign-in surface and fails.
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? [
            Google({
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            }),
          ]
        : []),
      Credentials({
        async authorize(credentials) {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const user = await db.query.users.findFirst({
            where: eq(users.email, parsed.data.email),
          });

          if (!user?.password) return null;

          // Brute-force protection: deny silently while locked, even if password is correct.
          if (isUserLocked(user)) return null;

          const valid = await verifyPassword(parsed.data.password, user.password);

          // Persist next attempt state (counter increment, lockout trigger, or reset on success).
          const nextState = nextLoginAttemptState(user, valid);
          await db.update(users).set(nextState).where(eq(users.id, user.id));

          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
          } as { id: string; email: string; name: string | null; role: string; emailVerified: Date | null };
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.emailVerified =
            (user as { emailVerified?: Date | null }).emailVerified ?? null;

          const existingRole = (user as { role?: string }).role ?? USER_ROLE.patient;
          const correctRole = resolveRole(user.email ?? "");
          if (correctRole !== existingRole && user.id) {
            await db
              .update(users)
              .set({ role: correctRole })
              .where(eq(users.id, user.id));
          }
          token.role = correctRole;
        }
        return token;
      },
      session({ session, token }) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.emailVerified =
          (token.emailVerified as Date | null | undefined) ?? null;
        return session;
      },
    },
  };
});

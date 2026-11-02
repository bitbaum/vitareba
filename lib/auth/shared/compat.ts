/**
 * /api/auth/*: AccountKit's own endpoints (its sign-in, sign-up, recovery and
 * account screens call them), plus the next-auth/react protocol that
 * `useSession` and `signOut` on Vita's pages still speak, answered with Vita's
 * session shape (lib/auth/shared/session.ts). docs/ACCOUNTKIT-MIGRATION.md.
 */
import type { Session } from "next-auth";
import { createNextAuthCompat } from "@bitbaum/accountkit/auth/nextauth-compat";
import { PORTAL_URL } from "@/lib/config/company";
import { AUTH_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { sharedAuth } from "./runtime";
import { vitaSession } from "./session";

export const compat = createNextAuthCompat<Session>({
  runtime: sharedAuth,
  siteUrl: () => PORTAL_URL,
  signInPath: AUTH_ROUTES.login,
  landing: PORTAL_ROUTES.dashboard,
  toSession: (shared) => vitaSession(shared),
  credentials: {
    credentials: {
      name: "Credentials",
      resolve: async (form) => {
        const email = String(form.get("email") ?? "")
          .trim()
          .toLowerCase();
        return email ? { email } : null;
      },
    },
  },
  // "Sign in with OrangeCat" always signs in; linking lives in the account panel.
  linkWhenSignedIn: () => false,
  // Vita renders AccountKit's screens and has no credential writer of its own.
  screens: "accountkit",
});

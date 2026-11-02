/**
 * Who is signed in, and /api/auth/*. Accounts live in AccountKit (its shared
 * runtime, lib/auth/shared/); the session shape (id, email, role,
 * emailVerified) is read from the `users` row on every request, so a changed
 * role or a removed account takes effect at once.
 */
import type { Session } from "next-auth";
import { compat } from "./shared/compat";
import { sharedSession } from "./shared/session";

/** The session of this request, for server components and route handlers. */
export async function auth(): Promise<Session | null> {
  return sharedSession();
}

/** /api/auth/*: AccountKit's endpoints, and next-auth/react's calls answered from them. */
export const handlers = compat.route;

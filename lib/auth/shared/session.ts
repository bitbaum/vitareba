/**
 * Today's session shape (`id`, `email`, `role`, `emailVerified`), answered from
 * a shared AccountKit session. Every request rereads the `users` row, so a
 * deleted account or a changed role takes effect at once, not at a token's
 * revalidation interval.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { getInstance } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveRole } from "@/lib/domain/auth";
import { sharedAuth } from "./runtime";

type SharedSession = { user: { id: string }; session: { expiresAt: Date } };

export async function vitaSession(shared: SharedSession | null): Promise<Session | null> {
  if (!shared) return null;
  const db = getInstance();
  const row = await db.query.users.findFirst({
    where: eq(users.id, shared.user.id),
    columns: { id: true, email: true, name: true, image: true, role: true, emailVerified: true },
  });
  if (!row) return null;
  const role = resolveRole(row.email, row.role);
  // Promote-only, as at NextAuth sign-in: env-listed admins get their row
  // lifted so the rest of the app agrees; DB-granted roles are never demoted.
  if (role !== row.role) await db.update(users).set({ role }).where(eq(users.id, row.id));
  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      role,
      emailVerified: row.emailVerified,
    },
    expires: new Date(shared.session.expiresAt).toISOString(),
  } as Session;
}

/** The session of this request (server components, route handlers). */
export const sharedSession = cache(async () => vitaSession(await sharedAuth.getSession()));

/** The session behind request headers (the proxy). */
export async function sharedSessionFor(headers: Headers): Promise<Session | null> {
  return vitaSession(await sharedAuth.sessionFor(headers).catch(() => null));
}

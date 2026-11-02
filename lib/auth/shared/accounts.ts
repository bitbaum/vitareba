/**
 * A person AccountKit created (a sign-up, an email sign-in link, a first
 * OrangeCat or bitbaum sign-in) gets Vita's `users` row under the same id, so
 * every Vita table can reference them, and the empty profile row and welcome
 * sequence registration gave them. Idempotent: AccountKit may call this more
 * than once for one person.
 */
import { eq } from "drizzle-orm";
import { getInstance } from "@/lib/db";
import { authUsers, profiles, users } from "@/lib/db/schema";
import { enqueueWelcomeEmails } from "@/lib/domain/email-queue";

export async function ensureVitaUser(account: { userId: string }): Promise<void> {
  const db = getInstance();
  const existing = await db.query.users.findFirst({
    where: eq(users.id, account.userId),
    columns: { id: true },
  });
  if (existing) return;
  const [shared] = await db
    .select({ email: authUsers.email, name: authUsers.name, verified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, account.userId))
    .limit(1);
  if (!shared) return;
  // An address from a provider is never proof (AccountKit gives OIDC people a
  // `.invalid` placeholder), so a new person starts as a patient; the role
  // comes from users.role and ADMIN_EMAILS, never from the shared account.
  const inserted = await db
    .insert(users)
    .values({
      id: account.userId,
      email: shared.email,
      name: shared.name || null,
      emailVerified: shared.verified ? new Date() : null,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (inserted.length === 0) return;
  await db.insert(profiles).values({ userId: account.userId }).onConflictDoNothing();
  await enqueueWelcomeEmails({ userId: account.userId, triggeredAt: new Date() }).catch((error) =>
    console.error("[auth] welcome sequence failed", {
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

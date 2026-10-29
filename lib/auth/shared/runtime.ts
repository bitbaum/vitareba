/**
 * Vita on AccountKit's shared account runtime. Off until AUTH_RUNTIME=accountkit;
 * NextAuth stays authoritative until the import and switch
 * (docs/ACCOUNTKIT-MIGRATION.md).
 */
import bcrypt from "bcryptjs";
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
import { createAuthMailer } from "@bitbaum/accountkit/auth/mail";
import { COMPANY, PORTAL_URL } from "@/lib/config/company";
import { getInstance } from "@/lib/db";
import { authTables } from "@/lib/db/schema";

/** Whether the shared runtime answers. NextAuth answers otherwise. */
export function sharedAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_RUNTIME === "accountkit";
}

const site = { url: PORTAL_URL, title: COMPANY.name, slug: "vita" };

/** Account mail through the fleet transport (RESEND_*). */
export const sharedAuthMailer = createAuthMailer({ site });

export const sharedAuth = createAuthRuntime({
  site,
  mail: sharedAuthMailer,
  isDatabaseConfigured: (env) => sharedAuthEnabled(env) && Boolean(env.DATABASE_URL),
  getDatabase: () => getInstance(),
  schema: authTables,
  // Imported plain bcrypt and AccountKit $bs1$ hashes keep working.
  legacyBcrypt: bcrypt,
});

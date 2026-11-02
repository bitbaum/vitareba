/**
 * Vita's accounts, on AccountKit's shared runtime: email and password, an
 * email sign-in link, passkeys, two-factor codes, password recovery, Sign in
 * with OrangeCat and the shared bitbaum sign-in, each shown when its env is
 * set (lib/auth/methods.ts). AccountKit is the only writer of credentials
 * (docs/ACCOUNTKIT-MIGRATION.md).
 */
import bcrypt from "bcryptjs";
import { createAuthRuntime } from "@bitbaum/accountkit/auth/next";
import { createAuthMailer } from "@bitbaum/accountkit/auth/mail";
import { COMPANY, PORTAL_URL } from "@/lib/config/company";
import { getInstance } from "@/lib/db";
import { authTables } from "@/lib/db/schema";
import { ensureVitaUser } from "./accounts";
import { vitaPlugin } from "./vita-plugin";

const site = { url: PORTAL_URL, title: COMPANY.name, slug: "vita" };

/** Account mail through the fleet transport (RESEND_*). */
export const sharedAuthMailer = createAuthMailer({ site });

export const sharedAuth = createAuthRuntime({
  site,
  mail: sharedAuthMailer,
  // Only on a switched box (loki accountkit-switch.yml sets AUTH_RUNTIME after
  // the import). Anywhere else every auth route answers 503 instead of
  // writing accounts the import would then refuse to overwrite.
  isDatabaseConfigured: (env) => env.AUTH_RUNTIME === "accountkit" && Boolean(env.DATABASE_URL),
  getDatabase: () => getInstance(),
  schema: authTables,
  // Hashes imported from NextAuth are bcrypt (and AccountKit $bs1$); every
  // password set through AccountKit is its native scrypt.
  legacyBcrypt: bcrypt,
  // users.id is a uuid that 31 tables reference.
  ids: "uuid",
  onAccountCreated: ensureVitaUser,
  // Medical records are kept for ten years (/regulation#instant-deletion): a
  // patient asks for erasure (/api/account/deletion-request), never deletes.
  accountDeletion: false,
  plugins: [vitaPlugin()],
});

/**
 * What of a users row may leave the server.
 *
 * `GET /api/admin/patients` and `/api/admin/patients/[id]` returned the Drizzle
 * row verbatim (`db.query.users.findMany(...)` with no `columns:` projection),
 * so every response carried each patient's **bcrypt password hash**. Unlike a
 * route that hands you your own digest, this is a *cross-account* disclosure:
 * an admin console shipped other people's credential material to the browser,
 * in a clinic app, where the people concerned are patients.
 *
 * A digest is not a password, but it is the input to an offline attack that
 * costs the attacker nothing and the user everything, and it moves from a place
 * nothing can read it to a place everything can — an extension, an XSS, a proxy
 * log, a screenshot of an open devtools panel.
 *
 * This is an ALLOW-list and both halves are exhaustive over the schema:
 * `lib/db/__tests__/user-view.test.ts` fails until every column in `users` is
 * named as exposed or withheld. A deny-list can only name the columns that
 * existed when it was written, and the one that ships is the one added later.
 */
import { getTableColumns } from "drizzle-orm";
import { users } from "./schema";

export type UserRow = typeof users.$inferSelect;

/**
 * Safe for an authenticated admin managing patients. `failedLoginAttempts` and
 * `lockedUntil` are deliberately here: they are not secrets, and an admin
 * helping someone locked out of their account needs to see them.
 */
export const ADMIN_PATIENT_FIELDS = [
  "id",
  "name",
  "email",
  "emailVerified",
  "image",
  "role",
  "isClinician",
  "failedLoginAttempts",
  "lockedUntil",
  "createdAt",
] as const satisfies ReadonlyArray<keyof UserRow>;

/** Withheld, each with the reason it can never be sent. */
export const USER_WITHHELD_FIELDS: Readonly<Partial<Record<keyof UserRow, string>>> = {
  password:
    "bcrypt digest of the user's password — nothing in a browser can use it, anything in a browser could take it, and here it belongs to someone other than the caller",
};

export type AdminPatientView = Pick<UserRow, (typeof ADMIN_PATIENT_FIELDS)[number]>;

/**
 * Project a users row for an admin response, preserving any relations the query
 * loaded (`profile`, `assessmentResults`) — those are patient data the console
 * legitimately shows, and they carry no credential material.
 */
export function toAdminPatientView<T extends UserRow>(
  row: T,
): AdminPatientView & Omit<T, keyof UserRow> {
  const columns = Object.keys(getTableColumns(users)) as Array<keyof UserRow>;
  const allowed = new Set<string>(ADMIN_PATIENT_FIELDS);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // A key that is not a users column is a loaded relation — keep it.
    if (!columns.includes(key as keyof UserRow) || allowed.has(key)) {
      out[key] = value;
    }
  }
  return out as AdminPatientView & Omit<T, keyof UserRow>;
}

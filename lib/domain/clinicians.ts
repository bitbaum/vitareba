/**
 * Who is a clinician here, decided by the practice owner directly — not a
 * public "apply" form. Every account starts as a patient, and the only way
 * to change that is an admin adding someone they already know, the same way
 * they'd hand a new hire an office key. There is no self-service path.
 *
 * Reuses the `clinician_applications` table as an audit trail (who granted
 * it, when) rather than adding a new table for the same fact — a grant is
 * recorded exactly like an approved application always was.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clinicianApplications, users } from "@/lib/db/schema";

const GRANT_NOTE = "Added directly by admin.";

export const grantClinicianSchema = z.object({
  email: z.string().trim().min(1).max(255).email(),
});

export type ClinicianRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
};

export type ClinicianActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Everyone currently marked as a clinician — the roster an owner manages. */
export async function listClinicians(): Promise<ClinicianRow[]> {
  return db.query.users.findMany({
    where: eq(users.isClinician, true),
    orderBy: [desc(users.createdAt)],
    columns: { id: true, name: true, email: true, createdAt: true },
  });
}

/**
 * Grant clinician status to an existing patient account, by email. Fails
 * closed and specifically: no account with that email, or already a
 * clinician — an owner should know exactly why a grant didn't happen.
 */
export async function grantClinicianByEmail(
  email: string,
  grantedBy: string,
): Promise<ClinicianActionResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
    columns: { id: true, isClinician: true },
  });
  if (!user) return { ok: false, error: "No account with that email address." };
  if (user.isClinician) return { ok: false, error: "That account is already a clinician." };

  const [row] = await db.transaction(async (tx) => {
    await tx.update(users).set({ isClinician: true }).where(eq(users.id, user.id));
    return tx
      .insert(clinicianApplications)
      .values({
        userId: user.id,
        message: GRANT_NOTE,
        status: "approved",
        reviewedBy: grantedBy,
        reviewedAt: new Date(),
      })
      .returning({ id: clinicianApplications.id });
  });
  return { ok: true, id: row.id };
}

/** Revoke clinician status. Past grant/audit history is left untouched. */
export async function revokeClinicianStatus(userId: string): Promise<ClinicianActionResult> {
  const [row] = await db
    .update(users)
    .set({ isClinician: false })
    .where(and(eq(users.id, userId), eq(users.isClinician, true)))
    .returning({ id: users.id });
  if (!row) return { ok: false, error: "That account is not currently a clinician." };
  return { ok: true, id: row.id };
}

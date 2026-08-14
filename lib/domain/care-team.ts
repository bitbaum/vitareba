/**
 * CARE TEAM — who treats whom. One definition, used by three surfaces:
 * the patient's own provider picker, the admin's care-team card, and the
 * booking/messaging flows that need "my clinician" as a default.
 *
 * Self-pairs (a clinician on their own care team) are ALLOWED by design:
 * VitaReBa's clinicians are dual-role (they are patients in this product too)
 * and need to walk their own patient path to see what patients see.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { careTeam, users } from "@/lib/db/schema";

export type Clinician = { id: string; name: string | null };

/** A clinician plus the address to notify them at (users.email is NOT NULL). */
export type ClinicianContact = Clinician & { email: string };

export type CareTeamResult = { ok: true } | { ok: false; error: string };

/** Every account marked as a clinician — the pool a patient can choose from. */
export async function getClinicianRoster(): Promise<Clinician[]> {
  return db.query.users.findMany({
    where: eq(users.isClinician, true),
    columns: { id: true, name: true },
  });
}

/**
 * One clinician by id — null when the id is unknown or the account is not a
 * clinician. This is the SSOT for "is this a real clinician?", so callers that
 * accept a clinicianId from a request body validate it here rather than
 * re-deriving the rule.
 */
export async function getClinicianById(id: string): Promise<ClinicianContact | null> {
  const row = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.isClinician, true)),
    columns: { id: true, name: true, email: true },
  });
  return row ?? null;
}

/**
 * Clinician ids currently treating this patient, oldest membership first —
 * the same order as getPrimaryClinicianId, so a UI that defaults to the first
 * of this list picks exactly the clinician the server would have defaulted to.
 */
export async function getCareTeamIds(patientId: string): Promise<string[]> {
  const rows = await db.query.careTeam.findMany({
    where: eq(careTeam.patientId, patientId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
    columns: { clinicianId: true },
  });
  return rows.map((r) => r.clinicianId);
}

/**
 * The clinician to default to for this patient — their care team's first
 * member, or null when nobody treats them yet (callers fall back to the
 * roster). Ordered by care-team creation so "my doctor" is stable.
 */
export async function getPrimaryClinicianId(patientId: string): Promise<string | null> {
  const row = await db.query.careTeam.findFirst({
    where: eq(careTeam.patientId, patientId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
    columns: { clinicianId: true },
  });
  return row?.clinicianId ?? null;
}

export async function addCareTeamMember(
  clinicianId: string,
  patientId: string
): Promise<CareTeamResult> {
  const clinician = await getClinicianById(clinicianId);
  if (!clinician) return { ok: false, error: "Unknown clinician" };

  await db.insert(careTeam).values({ clinicianId, patientId }).onConflictDoNothing();
  return { ok: true };
}

export async function removeCareTeamMember(
  clinicianId: string,
  patientId: string
): Promise<CareTeamResult> {
  await db
    .delete(careTeam)
    .where(and(eq(careTeam.patientId, patientId), eq(careTeam.clinicianId, clinicianId)));
  return { ok: true };
}

/**
 * CARE TEAM — who treats whom. One definition, used by three surfaces:
 * the patient's own provider picker, the admin's care-team card, and the
 * booking/messaging flows that need "my clinician" as a default.
 *
 * Self-pairs (a clinician on their own care team) are ALLOWED by design:
 * Vita's clinicians are dual-role (they are patients in this product too)
 * and need to walk their own patient path to see what patients see.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, careTeam, profiles } from "@/lib/db/schema";

export type Clinician = { id: string; name: string | null; acceptingPatients: boolean };

/** A clinician plus the address to notify them at (users.email is NOT NULL). */
export type ClinicianContact = Clinician & { email: string };

export type CareTeamResult = { ok: true } | { ok: false; error: string };

/**
 * Every account marked as a clinician — the pool a patient can choose from.
 *
 * A clinician is NEVER hidden here for being closed to new patients — hiding a
 * person reads as the clinic disowning them, and an existing patient must still
 * be able to find their own doctor. `acceptingPatients` is carried so the UI can
 * say so and steer NEW choices elsewhere; enforcement lives at the point a
 * patient actually chooses (canPatientChooseClinician), not at listing time.
 */
export async function getClinicianRoster(): Promise<Clinician[]> {
  const rows = await db.query.users.findMany({
    where: (u, { eq }) => eq(u.isClinician, true),
    columns: { id: true, name: true },
    with: { profile: { columns: { acceptingPatients: true } } },
  });
  // A clinician with no profile row yet (the column lives on `profiles`,
  // created lazily on first save) reads as accepting — the same default the
  // column itself carries, kept honest rather than silently becoming `false`
  // through the missing relation.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    acceptingPatients: r.profile?.acceptingPatients ?? true,
  }));
}

/**
 * One clinician by id — null when the id is unknown or the account is not a
 * clinician. This is the SSOT for "is this a real clinician?", so callers that
 * accept a clinicianId from a request body validate it here rather than
 * re-deriving the rule.
 */
export async function getClinicianById(id: string): Promise<ClinicianContact | null> {
  const row = await db.query.users.findFirst({
    where: (u, { and, eq }) => and(eq(u.id, id), eq(u.isClinician, true)),
    columns: { id: true, name: true, email: true },
    with: { profile: { columns: { acceptingPatients: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    acceptingPatients: row.profile?.acceptingPatients ?? true,
  };
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

/**
 * May this patient start (or continue) a relationship with this clinician?
 *
 * THE ONE PLACE this is decided — the care-team picker and a new slot booking
 * both call it, so "not accepting" means the same thing everywhere instead of
 * being enforced once and forgotten elsewhere.
 *
 *   • Choosing yourself is always allowed — a dual-role clinician must be able
 *     to walk their own patient path regardless of their own intake setting.
 *   • An EXISTING relationship is always allowed to continue. Closing intake
 *     protects a calendar from new patients; it must never look like being
 *     dropped by a doctor mid-treatment. "Existing" is deliberately wider than
 *     care-team membership: a patient who has ever had ANY booking with this
 *     clinician (even one still pending) already has a relationship, and a
 *     patient who has not yet completed their own care-team pick should not be
 *     blocked from confirming the very consultation that would create it.
 *   • Otherwise it comes down to whether the clinician is accepting.
 */
export async function canPatientChooseClinician(
  patientId: string,
  clinicianId: string
): Promise<CareTeamResult> {
  if (patientId === clinicianId) return { ok: true };

  const clinician = await getClinicianById(clinicianId);
  if (!clinician) return { ok: false, error: "Unknown clinician" };
  if (clinician.acceptingPatients) return { ok: true };

  const existing = await db.query.careTeam.findFirst({
    where: and(eq(careTeam.patientId, patientId), eq(careTeam.clinicianId, clinicianId)),
    columns: { patientId: true },
  });
  if (existing) return { ok: true };

  const priorBooking = await db.query.bookings.findFirst({
    where: and(eq(bookings.userId, patientId), eq(bookings.clinicianId, clinicianId)),
    columns: { id: true },
  });
  if (priorBooking) return { ok: true };

  return {
    ok: false,
    error: `${clinician.name ?? "This clinician"} is not accepting new patients right now.`,
  };
}

/** Whether this clinician is currently taking on new patients. Missing profile reads as accepting. */
export async function isAcceptingPatients(clinicianId: string): Promise<boolean> {
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.userId, clinicianId),
    columns: { acceptingPatients: true },
  });
  return row?.acceptingPatients ?? true;
}

/**
 * Self-service only: a clinician sets their OWN status. Upserts the profile
 * row rather than assuming one exists — profiles are created lazily, and a
 * clinician who has never touched their profile still needs to be able to
 * close intake on day one.
 */
export async function setAcceptingPatients(clinicianId: string, accepting: boolean): Promise<void> {
  await db
    .insert(profiles)
    .values({ userId: clinicianId, acceptingPatients: accepting })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { acceptingPatients: accepting, updatedAt: new Date() },
    });
}

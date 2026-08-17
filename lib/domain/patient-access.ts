/**
 * WHO MAY SEE AND WRITE A PATIENT'S RECORD — one definition, because the
 * alternative is every new clinical surface inventing its own answer and one of
 * them getting it wrong. A single missed check here shows one patient's blood
 * results to another; that is the failure this file exists to make impossible.
 *
 * The rule:
 *   • the patient themselves — always reads their own record
 *   • an admin — reads and writes any record (Manuel runs the practice)
 *   • a clinician on the patient's care team — reads and writes that record
 *   • everyone else — nothing, and the caller must answer 404, never 403,
 *     so the response cannot be used to discover that a patient exists.
 *
 * Care-team membership is the ONLY thing that makes a clinician a treating
 * clinician. Being marked `isClinician` is a capability, not an entitlement:
 * it says this person can treat patients, never that they may read this one.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { careTeam } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/config/auth";

export type PatientRelation = "self" | "admin" | "clinician" | "none";

export type PatientAccess = {
  relation: PatientRelation;
  /** May read the clinical record. */
  canRead: boolean;
  /**
   * May record results that carry clinical authority — a laboratory value, a
   * measurement attributed to the clinic. A patient records their own vitals
   * (see PATIENT_ENTERABLE_KEYS) but never signs off a lab result, so that the
   * record always says who vouched for a number.
   */
  canRecordClinical: boolean;
};

const NO_ACCESS: PatientAccess = { relation: "none", canRead: false, canRecordClinical: false };

export type AccessViewer = { id: string; role?: string | null };

/**
 * Resolves what this viewer may do with this patient's record.
 *
 * Order matters, and not in the obvious way: care-team membership is checked
 * even for a viewer looking at their own record, because Vita's clinicians
 * are their own patients by design — a clinician on their own care team must be
 * able to enter their own laboratory results, and a plain "it's you, so you're
 * just a patient" shortcut would silently take that away.
 */
export async function getPatientAccess(
  viewer: AccessViewer,
  patientId: string
): Promise<PatientAccess> {
  if (!viewer?.id || !patientId) return NO_ACCESS;

  if (viewer.role === USER_ROLE.admin) {
    return { relation: "admin", canRead: true, canRecordClinical: true };
  }

  const treats = await isOnCareTeam(viewer.id, patientId);
  if (treats) {
    return {
      relation: viewer.id === patientId ? "self" : "clinician",
      canRead: true,
      canRecordClinical: true,
    };
  }

  if (viewer.id === patientId) {
    return { relation: "self", canRead: true, canRecordClinical: false };
  }

  return NO_ACCESS;
}

/** True when this clinician is on that patient's care team. */
export async function isOnCareTeam(clinicianId: string, patientId: string): Promise<boolean> {
  const row = await db.query.careTeam.findFirst({
    where: and(eq(careTeam.clinicianId, clinicianId), eq(careTeam.patientId, patientId)),
    columns: { clinicianId: true },
  });
  return Boolean(row);
}

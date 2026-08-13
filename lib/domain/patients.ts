/**
 * WHO COUNTS AS A PATIENT — the one definition, used by the admin patient
 * list, the admin patients API and the reports page. Before this existed the
 * three surfaces disagreed (reports said 3 patients / 0 critical while the
 * list showed 5 / 1 critical) the moment care_team let dual-role clinicians
 * be patients.
 *
 * A patient is: any account with role=patient, PLUS anyone somebody treats
 * (a care_team row as patient — that is how clinician/admin accounts like
 * George appear on the clinical side).
 */

import { eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { careTeam, users } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/config/auth";

export function patientScope(): SQL {
  return or(
    eq(users.role, USER_ROLE.patient),
    inArray(users.id, db.select({ id: careTeam.patientId }).from(careTeam))
  )!;
}

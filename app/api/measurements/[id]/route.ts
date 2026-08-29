export const dynamic = "force-dynamic";

/**
 * Remove one measurement.
 *
 * Wrong numbers happen — a transposed digit, a value typed against the wrong
 * patient, a home reading taken with the cuff on backwards. Leaving those in a
 * clinical record is worse than removing them, because a trend drawn through a
 * bad point tells a story that never happened.
 *
 * Who may remove what:
 *   • a clinician or admin on the record — anything, including their own errors
 *   • the patient — only readings they took themselves (source home/wearable)
 *
 * A patient cannot delete a laboratory result. The record of what a laboratory
 * reported is not theirs to edit; the route to changing it is a conversation
 * with their clinician, which is exactly the conversation that should happen.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { measurements } from "@/lib/db/schema";
import { getPatientAccess } from "@/lib/domain/patient-access";
import { UUID_RE } from "@/lib/utils/validate";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";

/** Provenance a patient may remove on their own authority. */
const SELF_RECORDED_SOURCES = ["home", "wearable"];

const notFound = () => NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid measurement id");

  let row;
  try {
    row = await db.query.measurements.findFirst({
      where: eq(measurements.id, id),
      columns: { patientId: true, source: true },
    });
  } catch (err) {
    console.error("[api/measurements] lookup failed:", err);
    return serviceUnavailable();
  }
  if (!row) return notFound();

  const access = await getPatientAccess(session.user, row.patientId).catch(() => null);
  if (access === null) return serviceUnavailable();
  // Someone else's record answers exactly as an id that does not exist.
  if (!access.canRead) return notFound();

  if (!access.canRecordClinical && !SELF_RECORDED_SOURCES.includes(row.source)) {
    return NextResponse.json(
      {
        success: false,
        error: "Laboratory results can only be corrected by your clinician — send them a message",
      },
      { status: 403 },
    );
  }

  try {
    await db.delete(measurements).where(eq(measurements.id, id));
  } catch (err) {
    console.error("[api/measurements] delete failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not remove — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

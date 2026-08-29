export const dynamic = "force-dynamic";

/**
 * Clinical measurements — read a patient's series, record new values.
 *
 * Two rules govern everything here:
 *
 * 1. NOT-YOURS READS 404, NEVER 403. A 403 confirms the patient exists, which
 *    turns this endpoint into a directory of who is treated at a psychiatric
 *    clinic. The same rule already guards document downloads.
 * 2. A PATIENT MAY RECORD VITALS, NEVER LABORATORY RESULTS. Both go in the same
 *    table, so the boundary is enforced here rather than by which form was used
 *    — a form is a suggestion, an API is the actual door.
 */

import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { measurements, profiles } from "@/lib/db/schema";
import { getPatientAccess } from "@/lib/domain/patient-access";
import { measurementSubmissionSchema } from "@/lib/domain/measurements";
import {
  MEASUREMENT_HISTORY_DAYS,
  PATIENT_ENTERABLE_KEYS,
  isMeasurementKey,
  type BiologicalSex,
  type MeasurementKey,
} from "@/lib/config/measurements";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";

/** Provenance a patient may claim for their own reading. */
const SELF_RECORDED_SOURCES = ["home", "wearable"] as const;

/** The record does not exist, as far as anyone who may not read it is concerned. */
function notFound(): NextResponse {
  return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
}

export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") ?? session.user.id;

  const access = await getPatientAccess(session.user, patientId).catch(() => null);
  if (access === null) return serviceUnavailable();
  if (!access.canRead) return notFound();

  const days = parseDays(searchParams.get("days"));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // `kinds` narrows a chart to one marker. Unknown names are dropped rather than
  // rejected: a stale bookmark should show an empty chart, not an error page.
  const requested = (searchParams.get("kinds") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(isMeasurementKey);

  try {
    const rows = await db.query.measurements.findMany({
      where: and(
        eq(measurements.patientId, patientId),
        gte(measurements.measuredAt, cutoff),
        requested.length > 0 ? inArray(measurements.kind, requested) : undefined,
      ),
      orderBy: [desc(measurements.measuredAt)],
    });

    // The reference interval for ferritin, testosterone and half a dozen others
    // depends on it, so the client cannot render a result correctly without it.
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, patientId),
      columns: { biologicalSex: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        measurements: rows,
        biologicalSex: (profile?.biologicalSex ?? null) as BiologicalSex | null,
        relation: access.relation,
        canRecordClinical: access.canRecordClinical,
      },
    });
  } catch (err) {
    console.error("[api/measurements] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const patientId =
    typeof (body as { patientId?: unknown })?.patientId === "string"
      ? (body as { patientId: string }).patientId
      : session.user.id;

  const access = await getPatientAccess(session.user, patientId).catch(() => null);
  if (access === null) return serviceUnavailable();
  if (!access.canRead) return notFound();

  const parsed = measurementSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid measurement", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { measuredAt, source, entries } = parsed.data;

  if (!access.canRecordClinical) {
    // A patient's own reading: only markers they can actually take, and only
    // provenance they can honestly claim. Letting a patient post source "lab"
    // would put an unverified number in the record wearing a laboratory's authority.
    const notAllowed = entries
      .map((e) => e.kind as MeasurementKey)
      .filter((k) => !(PATIENT_ENTERABLE_KEYS as readonly string[]).includes(k));
    if (notAllowed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Laboratory results are recorded by your clinician",
          details: { kinds: notAllowed },
        },
        { status: 403 },
      );
    }
    if (!(SELF_RECORDED_SOURCES as readonly string[]).includes(source)) {
      return badRequest("Choose whether this reading was taken at home or by a device");
    }
  }

  try {
    const inserted = await db
      .insert(measurements)
      .values(
        entries.map((e) => ({
          patientId,
          kind: e.kind,
          value: e.value,
          measuredAt,
          source,
          // Who typed it, which is not who it is about. Nullable by design so
          // removing a clinician never deletes a patient's results.
          recordedBy: session.user.id,
          note: e.note ?? null,
        })),
      )
      .returning({ id: measurements.id });

    return NextResponse.json({ success: true, data: { count: inserted.length } }, { status: 201 });
  } catch (err) {
    console.error("[api/measurements] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not save — please try again" },
      { status: 500 },
    );
  }
}

function parseDays(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n) || n <= 0) return MEASUREMENT_HISTORY_DAYS;
  // A clinical record is read over years; the ceiling only stops an absurd query.
  return Math.min(n, MEASUREMENT_HISTORY_DAYS * 10);
}

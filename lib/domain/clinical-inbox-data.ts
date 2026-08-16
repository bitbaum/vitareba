/**
 * Fetching for the clinical inbox, kept apart from the judging.
 *
 * clinical-inbox.ts decides what deserves a clinician's attention and is a pure
 * function over rows. This file's only job is to produce those rows, and to do
 * it in a bounded number of queries — the inbox is the first screen of the day
 * and a page that takes four seconds to say "nothing needs you" will be closed
 * before it finishes.
 */

import { desc, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assessmentResults, bookings, dailyCheckins, measurements } from "@/lib/db/schema";
import { patientScope } from "@/lib/domain/patients";
import { getThreadsAwaitingReply } from "@/lib/domain/messages";
import { buildClinicalInbox, type ClinicalInbox, type InboxMeasurement } from "@/lib/domain/clinical-inbox";
import { SIGNAL_CHECKIN_WINDOW_DAYS } from "@/lib/config/admin";
import { MEASUREMENT_DEFS, type BiologicalSex } from "@/lib/config/measurements";
import { RESULT_REVIEW_WINDOW_DAYS } from "@/lib/config/inbox";
import { DAY_MS } from "@/lib/utils/format";
import { RECENT_ASSESSMENTS_LIMIT } from "@/lib/config/portal";

/** Only markers with a recognised action threshold can ever raise an alert. */
const ALERTING_KINDS = MEASUREMENT_DEFS.filter((d) => d.alert).map((d) => d.key);

export async function loadClinicalInbox(now = new Date()): Promise<ClinicalInbox> {
  const cutoff = new Date(now.getTime() - RESULT_REVIEW_WINDOW_DAYS * DAY_MS);

  const [patientRows, measurementRows, threadRows] = await Promise.all([
    db.query.users.findMany({
      where: patientScope(),
      columns: { id: true, name: true, email: true, createdAt: true },
      with: {
        profile: { columns: { biologicalSex: true } },
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: RECENT_ASSESSMENTS_LIMIT,
          columns: { overallScore: true, completedAt: true },
        },
        bookings: {
          orderBy: [desc(bookings.createdAt)],
          columns: { id: true, status: true, createdAt: true, scheduledAt: true },
        },
        dailyCheckins: {
          orderBy: [desc(dailyCheckins.date)],
          limit: SIGNAL_CHECKIN_WINDOW_DAYS,
          columns: { date: true, sleep: true, energy: true, mood: true, focus: true, stress: true },
        },
      },
    }),
    ALERTING_KINDS.length === 0
      ? Promise.resolve([])
      : db.query.measurements.findMany({
          where: (m, { and }) =>
            and(inArray(m.kind, ALERTING_KINDS), gte(measurements.measuredAt, cutoff)),
          orderBy: [desc(measurements.measuredAt)],
          columns: { patientId: true, kind: true, value: true, measuredAt: true },
        }),
    getThreadsAwaitingReply(),
  ]);

  return buildClinicalInbox({
    now,
    patients: patientRows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      registeredAt: p.createdAt,
      biologicalSex: (p.profile?.biologicalSex ?? null) as BiologicalSex | null,
      checkins: p.dailyCheckins,
      assessments: p.assessmentResults,
      bookings: p.bookings,
    })),
    latestMeasurements: newestPerPatientPerKind(measurementRows),
    // Everything this query returns is, by definition, awaiting a reply.
    threads: threadRows.map((t) => ({ ...t, awaitingReply: true })),
  });
}

/**
 * Keeps only the newest value per patient per marker.
 *
 * It sorts rather than trusting the caller's ORDER BY. The query does order
 * newest-first, but a function whose correctness depends on its caller's sort
 * is one refactor away from silently alerting on last year's blood pressure —
 * and that failure looks exactly like a working feature.
 *
 * Done here rather than in SQL so the query stays a plain indexed range scan and
 * the deduplication sits somewhere a test can reach.
 */
export function newestPerPatientPerKind(rows: readonly InboxMeasurement[]): InboxMeasurement[] {
  const newest = new Map<string, InboxMeasurement>();
  for (const row of rows) {
    const key = `${row.patientId}:${row.kind}`;
    const held = newest.get(key);
    if (!held || row.measuredAt > held.measuredAt) newest.set(key, row);
  }
  return [...newest.values()];
}

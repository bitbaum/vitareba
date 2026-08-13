/**
 * DB-facing side of the slot engine — resolves clinicians, their rules, and
 * the busy intervals that block their slots. The engine itself
 * (scheduling.ts) stays pure and injectable.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, users } from "@/lib/db/schema";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import { getAvailabilityForEmail, type ClinicianAvailability } from "@/lib/config/scheduling";
import { generateSlots, slotBusyInterval, type BusyInterval } from "./scheduling";

export type Clinician = { id: string; name: string | null; email: string };

/** All bookable doctors, stable order. */
export async function getClinicians(): Promise<Clinician[]> {
  return db.query.users.findMany({
    where: eq(users.isClinician, true),
    columns: { id: true, name: true, email: true },
    orderBy: [asc(users.createdAt)],
  });
}

/**
 * Active (pending/confirmed) scheduled appointments from `now` on that block
 * this clinician. Legacy rows without a clinician block EVERY clinician —
 * conservative, no double-booking risk.
 */
export async function getBusyIntervals(
  now: Date,
  clinicianId: string,
  rules: ClinicianAvailability
): Promise<BusyInterval[]> {
  const rows = await db.query.bookings.findMany({
    where: and(
      inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed]),
      isNotNull(bookings.scheduledAt),
      gte(bookings.scheduledAt, now),
      or(eq(bookings.clinicianId, clinicianId), isNull(bookings.clinicianId))
    ),
    columns: { scheduledAt: true },
  });
  return rows.map((r) => slotBusyInterval(r.scheduledAt!, rules));
}

/** Slots currently offered for one clinician. */
export async function getAvailableSlots(now: Date, clinician: Clinician): Promise<Date[]> {
  const rules = getAvailabilityForEmail(clinician.email);
  const busy = await getBusyIntervals(now, clinician.id, rules);
  return generateSlots({ now, rules, busy });
}

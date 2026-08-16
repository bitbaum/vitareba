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
import { getExternalBusy } from "./calendar-sync";

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
 * Everything that blocks this clinician's slots from `now` on.
 *
 * TWO SOURCES, and both are necessary:
 *
 *  1. VitaReBa's own appointments. Legacy rows without a clinician block EVERY
 *     clinician — conservative, and never a double booking.
 *  2. The clinician's real calendar, read from cache. Without this the engine
 *     cheerfully offers a patient the hour their doctor is at a school concert,
 *     which is the failure the whole subscription feature exists to prevent.
 *
 * External busy time is used AS IS, without the appointment buffer. The buffer
 * is time the clinic reserves after its own consultations for notes and
 * overruns; a dentist appointment in someone's private calendar already has
 * whatever margin they gave it, and padding it would quietly delete two further
 * bookable slots around every event in their life.
 */
export async function getBusyIntervals(
  now: Date,
  clinicianId: string,
  rules: ClinicianAvailability
): Promise<BusyInterval[]> {
  const [rows, external] = await Promise.all([
    db.query.bookings.findMany({
      where: and(
        inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed]),
        isNotNull(bookings.scheduledAt),
        gte(bookings.scheduledAt, now),
        or(eq(bookings.clinicianId, clinicianId), isNull(bookings.clinicianId))
      ),
      columns: { scheduledAt: true },
    }),
    getExternalBusy([clinicianId], now),
  ]);

  return [...rows.map((r) => slotBusyInterval(r.scheduledAt!, rules)), ...external];
}

/** Slots currently offered for one clinician. */
export async function getAvailableSlots(now: Date, clinician: Clinician): Promise<Date[]> {
  const rules = getAvailabilityForEmail(clinician.email);
  const busy = await getBusyIntervals(now, clinician.id, rules);
  return generateSlots({ now, rules, busy });
}

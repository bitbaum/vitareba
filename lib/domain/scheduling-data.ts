/**
 * DB-facing side of the slot engine — loads the busy intervals that block
 * slots. The engine itself (scheduling.ts) stays pure and injectable.
 */

import { and, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import { generateSlots, slotBusyInterval, type BusyInterval } from "./scheduling";

/** Active (pending/confirmed) scheduled appointments from `now` on. */
export async function getBusyIntervals(now: Date): Promise<BusyInterval[]> {
  const rows = await db.query.bookings.findMany({
    where: and(
      inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed]),
      isNotNull(bookings.scheduledAt),
      gte(bookings.scheduledAt, now)
    ),
    columns: { scheduledAt: true },
  });
  return rows.map((r) => slotBusyInterval(r.scheduledAt!));
}

/** Slots currently offered to patients. */
export async function getAvailableSlots(now: Date): Promise<Date[]> {
  const busy = await getBusyIntervals(now);
  return generateSlots({ now, busy });
}

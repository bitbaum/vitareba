/**
 * Scheduling — SSOT for Manuel's bookable availability.
 *
 * Phase 1 is portal-native: slots are generated from these rules minus already
 * booked appointments (single-clinician model — one active booking per slot,
 * enforced by a partial unique index on bookings.scheduled_at). External
 * calendar free/busy (CalDAV / Google) plugs into the same engine later as an
 * extra busy-interval source.
 *
 * All times are wall-clock in CLINIC_TIMEZONE (lib/config/company.ts).
 * Changing Manuel's hours = editing this file only.
 */

/** ISO weekday (1 = Monday … 7 = Sunday) → working windows as [start, end) */
export const WEEKLY_HOURS: Record<number, [string, string][]> = {
  1: [["09:00", "12:00"], ["13:30", "17:00"]],
  2: [["09:00", "12:00"], ["13:30", "17:00"]],
  3: [["09:00", "12:00"], ["13:30", "17:00"]],
  4: [["09:00", "12:00"], ["13:30", "17:00"]],
  5: [["09:00", "13:00"]],
  6: [],
  7: [],
};

/** Appointment length offered to patients. */
export const SLOT_MINUTES = 30;

/** Gap kept free after every appointment (notes, reset, overruns). */
export const BUFFER_MINUTES = 15;

/** Earliest bookable slot, measured from "now". */
export const LEAD_TIME_HOURS = 12;

/** How far into the future patients can book. */
export const HORIZON_DAYS = 21;

/** Hard cap on appointments per clinic day. */
export const MAX_PER_DAY = 6;

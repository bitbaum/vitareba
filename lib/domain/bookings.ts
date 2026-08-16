import { z } from "zod";
import { BOOKING_PREFERRED_DATE_MAX_LENGTH, BOOKING_NOTES_MAX_LENGTH } from "@/lib/config/portal";
import { BOOKING_TYPE_VALUES, MACHINE_TYPE_VALUES, BOOKING_STATUS_VALUES } from "@/lib/config/booking-status";

/** Validates a patient booking creation request body */
export const bookingCreateSchema = z.object({
  bookingType: z.enum(BOOKING_TYPE_VALUES).default("consultation"),
  machineType: z.enum(MACHINE_TYPE_VALUES).nullable().optional(),
  preferredDate: z.string().max(BOOKING_PREFERRED_DATE_MAX_LENGTH).optional(),
  notes: z.string().max(BOOKING_NOTES_MAX_LENGTH).optional(),
});

/** Validates an admin-initiated booking (for a specific patient, status settable) */
export const adminBookingCreateSchema = bookingCreateSchema.extend({
  patientId: z.string().uuid(),
  status: z.enum(BOOKING_STATUS_VALUES).optional(),
});

/**
 * Validates a patient slot booking — an exact instant from /api/bookings/slots.
 * The route re-checks the slot against the engine, and the partial unique
 * index on bookings.scheduled_at settles any remaining race.
 */
export const slotBookingSchema = z.object({
  slot: z.string().datetime(),
  clinicianId: z.string().uuid(),
  bookingType: z.enum(BOOKING_TYPE_VALUES).default("consultation"),
  machineType: z.enum(MACHINE_TYPE_VALUES).nullable().optional(),
  notes: z.string().max(BOOKING_NOTES_MAX_LENGTH).optional(),
  /**
   * Who the appointment is FOR. Absent means the person booking it — which is
   * the ordinary case and the only one a patient may use. An admin taking a
   * booking over the phone names the patient here; the route enforces that
   * permission, because a schema can describe a field but not who may send it.
   */
  patientId: z.string().uuid().optional(),
});

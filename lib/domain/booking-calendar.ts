/**
 * Booking → calendar event. ONE mapping, used by both calendar surfaces:
 * the .ics invite attached to confirmation emails and the clinician's
 * subscribable feed. If the two described the same appointment differently,
 * a calendar that received both would show two entries.
 */

import { COMPANY, PORTAL_URL } from "@/lib/config/company";
import { icsSequence, BOOKING_STATUS, type BookingStatus } from "@/lib/config/booking-status";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import type { IcsEvent } from "@/lib/domain/ics";

type Person = { name: string | null; email: string };

export type BookingCalendarInput = {
  bookingId: string;
  start: Date;
  slotMinutes: number;
  status: BookingStatus;
  patient: Person;
  clinician: Person;
  sessionLabel: string;
  createdAt: Date;
  /** bookings.revision — bumped on every change that alters the appointment. */
  revision?: number;
};

export const CLINIC_LOCATION = `${COMPANY.address.street}, ${COMPANY.address.zip} ${COMPANY.address.city}`;

export function bookingIcsEvent(input: BookingCalendarInput): IcsEvent {
  const patientName = input.patient.name ?? input.patient.email;
  const clinicianName = input.clinician.name ?? input.clinician.email;

  return {
    // Stable per booking — this is what lets a later update or cancellation
    // replace the entry instead of adding a second one.
    uid: `booking-${input.bookingId}@vitareba`,
    start: input.start,
    end: new Date(input.start.getTime() + input.slotMinutes * 60 * 1000),
    summary: `${COMPANY.shortName}: ${input.sessionLabel} — ${clinicianName}`,
    description: [
      `${input.sessionLabel} with ${clinicianName}.`,
      `Patient: ${patientName} (${input.patient.email}).`,
      `Manage this appointment: ${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
    ].join("\n"),
    location: CLINIC_LOCATION,
    organizer: { name: clinicianName, email: input.clinician.email },
    attendees: [
      { name: patientName, email: input.patient.email },
      { name: clinicianName, email: input.clinician.email },
    ],
    sequence: icsSequence(input.status, input.revision ?? 0),
    cancelled: input.status === BOOKING_STATUS.cancelled,
    now: input.createdAt,
  };
}

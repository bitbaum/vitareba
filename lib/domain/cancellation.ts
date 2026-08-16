/**
 * May this appointment be cancelled or moved, and is it late?
 *
 * Pure, so both sides of the product and the API that guards them all answer
 * the same way. A patient told "you can cancel this" by a button, and then told
 * "you cannot" by the server, has been lied to by one of them.
 */

import {
  CANCELLATION_NOTICE_HOURS,
  RESCHEDULE_NOTICE_HOURS,
} from "@/lib/config/cancellation";
import { BOOKING_STATUS, type BookingStatus } from "@/lib/config/booking-status";
import { HOUR_MS } from "@/lib/utils/format";

export type BookingTiming = {
  status: BookingStatus;
  /** Null for a date-only request that has no agreed time yet. */
  scheduledAt: Date | null;
  /**
   * When the appointment was booked. Needed to answer whether the patient ever
   * HAD the notice they are being judged against — see `hadTheChance` below.
   */
  createdAt?: Date | null;
};

export type ChangeVerdict =
  | { allowed: true; late: boolean; hoursNotice: number | null }
  | { allowed: false; reason: string };

/**
 * Hours between now and the appointment. Null when there is no agreed time —
 * a request nobody has scheduled cannot be early or late for anything.
 */
export function hoursOfNotice(scheduledAt: Date | null, now: Date): number | null {
  if (!scheduledAt) return null;
  return (scheduledAt.getTime() - now.getTime()) / HOUR_MS;
}

/**
 * Could this patient ever have given the notice we are about to judge them on?
 *
 * Slots are bookable from `leadTimeHours` ahead — 12 by default — while the
 * notice window is 24. So an appointment booked for tomorrow evening is ALREADY
 * inside the cancellation window at the moment it is created: the patient books
 * it and is immediately told that cancelling would be recorded as late. They
 * were never offered a way to do better.
 *
 * A rule that marks someone down for a choice the software never gave them is
 * not a policy, it is a bug wearing one. So "late" additionally requires that
 * the booking existed for long enough to have been cancelled in time.
 */
function hadTheChance(
  scheduledAt: Date | null,
  createdAt: Date | null | undefined,
  noticeHours: number
): boolean {
  if (!scheduledAt || !createdAt) return true; // Nothing to excuse them with.
  const leadAtBooking = (scheduledAt.getTime() - createdAt.getTime()) / HOUR_MS;
  return leadAtBooking >= noticeHours;
}

function assess(
  { status, scheduledAt, createdAt }: BookingTiming,
  now: Date,
  noticeHours: number,
  verb: string
): ChangeVerdict {
  if (status === BOOKING_STATUS.cancelled) {
    return { allowed: false, reason: "This appointment is already cancelled." };
  }
  if (status === BOOKING_STATUS.attended) {
    return { allowed: false, reason: "This appointment has already happened." };
  }
  // A past appointment is a record, not a plan. Cancelling it would rewrite
  // what happened; the honest action is to mark whether it was attended.
  if (scheduledAt && scheduledAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: `This appointment has already started — it cannot be ${verb}.` };
  }

  const notice = hoursOfNotice(scheduledAt, now);
  // No agreed time means no notice window to be inside — a date-only request is
  // always freely withdrawable — and neither is it late if the appointment was
  // never bookable with more notice than this in the first place.
  const inWindow = notice !== null && notice < noticeHours;
  const late = inWindow && hadTheChance(scheduledAt, createdAt, noticeHours);
  return { allowed: true, late, hoursNotice: notice };
}

export function assessCancellation(booking: BookingTiming, now: Date): ChangeVerdict {
  return assess(booking, now, CANCELLATION_NOTICE_HOURS, "cancelled");
}

export function assessReschedule(booking: BookingTiming, now: Date): ChangeVerdict {
  return assess(booking, now, RESCHEDULE_NOTICE_HOURS, "moved");
}

/**
 * How the notice reads to a person: "3 days", "18 hours", "in 40 minutes".
 * Used in the confirmation prompt, so it must never round a late cancellation
 * up into looking like it met the window.
 */
export function describeNotice(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1) {
    const minutes = Math.max(0, Math.floor(hours * 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (hours < 48) {
    const whole = Math.floor(hours);
    return `${whole} hour${whole === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

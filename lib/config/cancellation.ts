/**
 * SSOT for the cancellation and rescheduling policy.
 *
 * THE POLICY, AND WHY IT IS THIS ONE
 *
 * A cancelled appointment inside the notice window costs the clinic a slot it
 * cannot refill. Every booking system answers this somehow, and the common
 * answers are worse than they look:
 *
 *   • A late fee needs stored payment details, a dispute process, and turns
 *     "I woke up unable to function" into a bill. This is a psychiatric and
 *     metabolic practice; the patients most likely to cancel late are the ones
 *     the practice exists to help.
 *   • Removing the cancel button inside the window does not keep the
 *     appointment — it produces a no-show, which is strictly worse: the clinic
 *     finds out at the appointment instead of the night before, and the patient
 *     learns the portal is a thing that traps them.
 *
 * So: cancelling is ALWAYS possible, and a late cancellation is RECORDED rather
 * than punished. The patient is told plainly that it is late and why that
 * matters. The clinician sees it flagged and can act on a pattern — which is
 * clinical information in its own right, not just an accounting one.
 *
 * The only thing the software must never do is make it hard to say "I can't
 * come". Everything else is a conversation between two people.
 */

/** Hours of notice below which a cancellation is recorded as late. */
export const CANCELLATION_NOTICE_HOURS = 24;

/**
 * Rescheduling uses the same window. Moving an appointment two hours before it
 * starts leaves the clinic with the same unfillable hole as cancelling it.
 */
export const RESCHEDULE_NOTICE_HOURS = CANCELLATION_NOTICE_HOURS;

/**
 * The policy in words, shown BEFORE booking rather than only at cancellation.
 * A rule someone first meets while trying to cancel is a rule they experience
 * as a trap, however reasonable it is.
 */
export const CANCELLATION_POLICY = {
  /** One line, shown next to the confirm button. */
  summary: `Free to cancel or move up to ${CANCELLATION_NOTICE_HOURS} hours before.`,
  /** The full text, shown on the bookings page and in confirmation emails. */
  detail:
    `You can cancel or move an appointment at any time. With at least ` +
    `${CANCELLATION_NOTICE_HOURS} hours' notice the slot goes back to another patient and ` +
    `nothing else happens. Inside ${CANCELLATION_NOTICE_HOURS} hours the slot usually cannot ` +
    `be refilled, so it is recorded as a late cancellation and your clinician sees it. ` +
    `There is no fee, and it is always better to tell us than not to come.`,
  /**
   * Shown at the moment of a late cancellation, before it is confirmed —
   * BookingActions is the SAME control on both the patient's own bookings
   * page and the admin bookings table, and this line used to be the patient's
   * copy shown verbatim to a clinician cancelling on a patient's behalf
   * ("...message your clinician" told George to message himself). Two
   * versions, picked by actorLabel, same everywhere else in this file.
   */
  lateWarningPatient:
    `This is less than ${CANCELLATION_NOTICE_HOURS} hours before your appointment, so it will ` +
    `be recorded as a late cancellation. There is no charge. If you are unwell or something ` +
    `has happened, cancel anyway and message your clinician.`,
  lateWarningClinic:
    `This is less than ${CANCELLATION_NOTICE_HOURS} hours before the appointment, so it will be ` +
    `recorded as a late cancellation for the patient. There is no charge. If they need to be ` +
    `reached, message them directly.`,
} as const;

/** Longest reason a patient or clinician can attach to a cancellation. */
export const CANCELLATION_REASON_MAX = 500;

export const dynamic = "force-dynamic";

/**
 * One appointment: confirm it, move it, or cancel it.
 *
 * WHAT WAS WRONG HERE. PATCH required an admin, and the patient's own cancel
 * path (DELETE) only accepted bookings still in `pending`. Slot bookings are
 * created `confirmed` — so the moment picking a time started working, every
 * patient who picked one was stuck with it forever. Nothing could be moved at
 * all, by anybody.
 *
 * The model now, and it is the same on both sides:
 *
 *   • Anyone may cancel or move THEIR OWN appointment; an admin may do it for
 *     anyone. Notice is recorded, never enforced — see lib/config/cancellation.ts
 *     for why a portal that traps a patient produces no-shows rather than
 *     attendance.
 *   • Changing the STATUS (confirmed / attended) stays an admin act. It is a
 *     clinical record of what happened, not a preference.
 *   • Every change bumps `revision`, so the calendar entry a patient already
 *     has is REPLACED rather than duplicated. Rescheduling used to leave the
 *     old time in their calendar forever, because the sequence was derived from
 *     the status and the status does not change when a time does.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { bookings, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import {
  bookingConfirmedEmail,
  bookingAppointmentCancelledEmail,
  bookingRescheduledEmail,
  bookingChangedClinicianEmail,
} from "@/lib/email/templates";
import { PORTAL_URL, COMPANY, getAdminEmails } from "@/lib/config/company";
import { PORTAL_ROUTES, ADMIN_ROUTES } from "@/lib/config/routes";
import {
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  BOOKING_TYPE_CONFIG,
  MACHINE_TYPE_CONFIG,
} from "@/lib/config/booking-status";
import { USER_ROLE } from "@/lib/config/auth";
import { CANCELLATION_POLICY, CANCELLATION_REASON_MAX } from "@/lib/config/cancellation";
import { assessCancellation, assessReschedule } from "@/lib/domain/cancellation";
import { getClinicianAvailability } from "@/lib/domain/clinician-profile";
import { isBookableSlot } from "@/lib/domain/scheduling";
import { getBusyIntervals } from "@/lib/domain/scheduling-data";
import { canPatientChooseClinician } from "@/lib/domain/care-team";
import { buildIcsInvite } from "@/lib/domain/ics";
import { bookingIcsEvent } from "@/lib/domain/booking-calendar";
import { runAfterResponse } from "@/lib/utils/post-response";
import { displayName, formatSlotDay, formatSlotTime, formatDateISO } from "@/lib/utils/format";

const statusPatchSchema = z.object({ status: z.enum(BOOKING_STATUS_VALUES) });

const reschedulePatchSchema = z.object({
  slot: z.string().datetime(),
  /** Optional: moving to a different clinician is a different appointment. */
  clinicianId: z.string().uuid().optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(CANCELLATION_REASON_MAX).optional(),
});

type BookingRow = typeof bookings.$inferSelect;

const notFound = () => NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

/** The booking plus whether this session may change it. */
async function loadForChange(id: string, session: { user: { id: string; role?: string | null } }) {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, id) });
  if (!booking) return { booking: null as BookingRow | null, isAdmin: false, mayChange: false };
  const isAdmin = session.user.role === USER_ROLE.admin;
  // Someone else's appointment answers exactly like one that does not exist.
  return { booking, isAdmin, mayChange: isAdmin || booking.userId === session.user.id };
}

// ─── PATCH: confirm / mark attended (admin), or move (either side) ────────────

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid booking id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  let loaded;
  try {
    loaded = await loadForChange(id, session);
  } catch (err) {
    console.error("[api/bookings/id] lookup failed:", err);
    return serviceUnavailable();
  }
  const { booking, isAdmin, mayChange } = loaded;
  if (!booking || !mayChange) return notFound();

  // Moving an appointment — decided by the body carrying a new time, not by role.
  if (typeof (body as Record<string, unknown>)?.slot === "string") {
    return reschedule(body, booking, session, isAdmin);
  }

  // Recording what happened is a clinical act, not a patient preference.
  if (!isAdmin) return notFound();

  const parsed = statusPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
  }
  const status = parsed.data.status;

  // Cancelling through the status field must record everything a cancellation
  // records — otherwise the same act leaves two different shapes of history
  // depending on which button produced it.
  const cancelling = status === BOOKING_STATUS.cancelled;
  const verdict = cancelling ? assessCancellation(booking, new Date()) : null;

  let updated: BookingRow | undefined;
  try {
    [updated] = await db
      .update(bookings)
      .set({
        status,
        revision: sql`${bookings.revision} + 1`,
        ...(cancelling
          ? {
              cancelledAt: new Date(),
              cancelledBy: session.user.id,
              lateCancellation: verdict?.allowed === true ? verdict.late : false,
            }
          : {}),
      })
      .where(eq(bookings.id, id))
      .returning();
  } catch (err) {
    console.error("[api/bookings/id] update failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update booking — please try again" },
      { status: 500 }
    );
  }
  if (!updated) return notFound();

  if (status === BOOKING_STATUS.confirmed) {
    notifyPatient(updated, async (patient, sessionLabel) => ({
      subject: `Your ${sessionLabel.toLowerCase()} has been confirmed — ${COMPANY.shortName}`,
      html: bookingConfirmedEmail({
        patientName: displayName(patient.name, patient.email),
        sessionLabel,
        portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
      }),
    }));
  }
  if (cancelling) {
    announceCancellation(updated, session.user.id, null);
  }

  return NextResponse.json({ success: true, data: updated });
}

// ─── DELETE: cancel ───────────────────────────────────────────────────────────

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid booking id");

  // A reason is optional and may arrive with no body at all — a cancel button
  // that fails because it sent nothing would be a poor way to learn that.
  let reason: string | undefined;
  try {
    const raw = await req.json();
    reason = cancelSchema.safeParse(raw).data?.reason;
  } catch {
    reason = undefined;
  }

  let loaded;
  try {
    loaded = await loadForChange(id, session);
  } catch (err) {
    console.error("[api/bookings/id] lookup failed:", err);
    return serviceUnavailable();
  }
  const { booking, mayChange } = loaded;
  if (!booking || !mayChange) return notFound();

  const verdict = assessCancellation(booking, new Date());
  if (!verdict.allowed) {
    return NextResponse.json({ success: false, error: verdict.reason }, { status: 409 });
  }

  let updated: BookingRow | undefined;
  try {
    [updated] = await db
      .update(bookings)
      .set({
        status: BOOKING_STATUS.cancelled,
        cancelledAt: new Date(),
        cancelledBy: session.user.id,
        cancellationReason: reason ?? null,
        lateCancellation: verdict.late,
        revision: sql`${bookings.revision} + 1`,
      })
      .where(eq(bookings.id, id))
      .returning();
  } catch (err) {
    console.error("[api/bookings/id] cancel failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to cancel — please try again" },
      { status: 500 }
    );
  }
  if (!updated) return notFound();

  announceCancellation(updated, session.user.id, reason ?? null);

  return NextResponse.json({ success: true, data: { late: verdict.late } });
}

// ─── Rescheduling ─────────────────────────────────────────────────────────────

async function reschedule(
  body: unknown,
  booking: BookingRow,
  session: { user: { id: string; role?: string | null } },
  isAdmin: boolean
): Promise<NextResponse> {
  const parsed = reschedulePatchSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid time");

  const now = new Date();
  const verdict = assessReschedule(booking, now);
  if (!verdict.allowed) {
    return NextResponse.json({ success: false, error: verdict.reason }, { status: 409 });
  }

  const slot = new Date(parsed.data.slot);
  const clinicianId = parsed.data.clinicianId ?? booking.clinicianId;
  if (!clinicianId) {
    return badRequest("This booking has no clinician — pick one to schedule it");
  }

  let clinician;
  try {
    clinician = await db.query.users.findFirst({
      where: and(eq(users.id, clinicianId), eq(users.isClinician, true)),
      columns: { id: true, name: true, email: true },
    });
  } catch (err) {
    console.error("[api/bookings/id] clinician lookup failed:", err);
    return serviceUnavailable();
  }
  if (!clinician) return badRequest("Unknown clinician");

  // Only relevant when this actually SWITCHES doctor — moving a time with the
  // same clinician is not "choosing" anyone. Staff may override, same as a new
  // booking: an admin picking up the phone is the exception being made, not a
  // patient finding a workaround.
  if (!isAdmin && clinicianId !== booking.clinicianId) {
    try {
      const eligible = await canPatientChooseClinician(booking.userId, clinicianId);
      if (!eligible.ok) {
        return NextResponse.json({ success: false, error: eligible.error }, { status: 409 });
      }
    } catch (err) {
      console.error("[api/bookings/id] eligibility check failed:", err);
      return serviceUnavailable();
    }
  }

  const rules = await getClinicianAvailability(clinician.id);
  try {
    const busy = await getBusyIntervals(now, clinician.id, rules);
    // The appointment's OWN current slot must not block its move — otherwise
    // every reschedule collides with the booking being rescheduled.
    const others = busy.filter(
      (b) => !booking.scheduledAt || b.start.getTime() !== booking.scheduledAt.getTime()
    );
    if (!isBookableSlot(slot, { now, rules, busy: others })) {
      return NextResponse.json(
        { success: false, error: "That time is no longer available", code: "slot_taken" },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[api/bookings/id] reschedule re-check failed:", err);
    return serviceUnavailable();
  }

  const previous = booking.scheduledAt;
  let updated: BookingRow | undefined;
  try {
    [updated] = await db
      .update(bookings)
      .set({
        scheduledAt: slot,
        clinicianId: clinician.id,
        preferredDate: formatDateISO(slot),
        rescheduledFrom: previous ?? null,
        // A moved appointment is a confirmed one: the patient picked a real time.
        status: BOOKING_STATUS.confirmed,
        revision: sql`${bookings.revision} + 1`,
      })
      .where(eq(bookings.id, booking.id))
      .returning();
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { success: false, error: "That time was just taken — please pick another", code: "slot_taken" },
        { status: 409 }
      );
    }
    console.error("[api/bookings/id] reschedule failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to move — please try again" },
      { status: 500 }
    );
  }
  if (!updated) return notFound();

  const movedBySomeoneElse = updated.userId !== session.user.id;
  runAfterResponse(async () => {
    const patient = await db.query.users.findFirst({
      where: eq(users.id, updated.userId),
      columns: { name: true, email: true },
    });
    const sessionLabel = labelFor(updated);
    const toLabel = `${formatSlotDay(slot)}, ${formatSlotTime(slot)}`;
    const fromLabel = previous
      ? `${formatSlotDay(previous)}, ${formatSlotTime(previous)}`
      : "no fixed time";

    const invite =
      patient?.email && clinician
        ? buildIcsInvite(
            bookingIcsEvent({
              bookingId: updated.id,
              start: slot,
              slotMinutes: rules.slotMinutes,
              status: updated.status,
              patient: { name: patient.name, email: patient.email },
              clinician: { name: clinician.name, email: clinician.email },
              sessionLabel,
              createdAt: new Date(),
              revision: updated.revision,
            })
          )
        : null;
    const attachments = invite
      ? [{ filename: "appointment.ics", content: invite, contentType: "text/calendar; method=REQUEST" }]
      : undefined;

    if (patient?.email) {
      await sendEmail({
        to: patient.email,
        subject: `Moved: ${sessionLabel.toLowerCase()} is now ${toLabel} — ${COMPANY.shortName}`,
        html: bookingRescheduledEmail({
          patientName: displayName(patient.name, patient.email),
          sessionLabel,
          fromLabel,
          toLabel,
          portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
        }),
        attachments,
      });
    }

    const recipients = clinicRecipients(clinician?.email);
    if (recipients.length > 0) {
      await sendEmail({
        to: recipients,
        subject: `Appointment moved to ${toLabel} — ${displayName(patient?.name, patient?.email, "Unknown")}`,
        html: bookingChangedClinicianEmail({
          patientName: displayName(patient?.name, patient?.email, "Unknown"),
          patientEmail: patient?.email ?? "",
          headline: movedBySomeoneElse
            ? "An appointment was moved by the clinic."
            : "A patient moved their appointment.",
          detailLines: [`Was: ${fromLabel}`, `Now: ${toLabel}`, labelFor(updated)],
          adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${updated.userId}`,
        }),
        attachments,
      });
    }
  }, "[api/bookings/id] reschedule emails failed:");

  return NextResponse.json({ success: true, data: updated });
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function labelFor(booking: BookingRow): string {
  const type = BOOKING_TYPE_CONFIG[booking.bookingType]?.label ?? "Booking";
  const machine = booking.machineType ? MACHINE_TYPE_CONFIG[booking.machineType]?.label : null;
  return machine ? `${type} — ${machine}` : type;
}

/** Clinic addressees, deduplicated so a clinician who is also an admin gets one email. */
function clinicRecipients(clinicianEmail?: string | null): string[] {
  return Array.from(
    new Set(
      [clinicianEmail, ...getAdminEmails()]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.toLowerCase())
    )
  );
}

function notifyPatient(
  booking: BookingRow,
  build: (
    patient: { name: string | null; email: string },
    sessionLabel: string
  ) => Promise<{ subject: string; html: string }>
) {
  runAfterResponse(async () => {
    const patient = await db.query.users.findFirst({
      where: eq(users.id, booking.userId),
      columns: { name: true, email: true },
    });
    if (!patient?.email) return;
    const { subject, html } = await build(
      { name: patient.name, email: patient.email },
      labelFor(booking)
    );
    await sendEmail({ to: patient.email, subject, html });
  }, "[api/bookings/id] patient email failed:");
}

/**
 * Tell both sides, and send the calendar cancellation.
 *
 * The .ics with STATUS:CANCELLED at a higher SEQUENCE is what actually removes
 * the entry from the patient's calendar. An email alone leaves a ghost
 * appointment that will still buzz their phone on the day.
 */
function announceCancellation(booking: BookingRow, actorId: string, reason: string | null) {
  runAfterResponse(async () => {
    const [patient, clinician] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, booking.userId),
        columns: { name: true, email: true },
      }),
      booking.clinicianId
        ? db.query.users.findFirst({
            where: eq(users.id, booking.clinicianId),
            columns: { name: true, email: true },
          })
        : Promise.resolve(undefined),
    ]);

    const sessionLabel = labelFor(booking);
    const whenLabel = booking.scheduledAt
      ? `${formatSlotDay(booking.scheduledAt)}, ${formatSlotTime(booking.scheduledAt)}`
      : (booking.preferredDate ?? "an unscheduled date");

    let attachments;
    if (booking.scheduledAt && patient?.email && clinician?.email) {
      const rules = await getClinicianAvailability(booking.clinicianId!);
      const invite = buildIcsInvite(
        bookingIcsEvent({
          bookingId: booking.id,
          start: booking.scheduledAt,
          slotMinutes: rules.slotMinutes,
          status: BOOKING_STATUS.cancelled,
          patient: { name: patient.name, email: patient.email },
          clinician: { name: clinician.name, email: clinician.email },
          sessionLabel,
          createdAt: new Date(),
          revision: booking.revision,
        })
      );
      attachments = [
        { filename: "appointment.ics", content: invite, contentType: "text/calendar; method=CANCEL" },
      ];
    }

    if (patient?.email) {
      await sendEmail({
        to: patient.email,
        subject: `Cancelled: ${sessionLabel.toLowerCase()} on ${whenLabel} — ${COMPANY.shortName}`,
        html: bookingAppointmentCancelledEmail({
          patientName: displayName(patient.name, patient.email),
          sessionLabel,
          whenLabel,
          late: booking.lateCancellation,
          policyDetail: CANCELLATION_POLICY.detail,
          portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
        }),
        attachments,
      });
    }

    const recipients = clinicRecipients(clinician?.email);
    if (recipients.length > 0) {
      const byPatient = actorId === booking.userId;
      await sendEmail({
        to: recipients,
        subject: `Cancelled: ${whenLabel} — ${displayName(patient?.name, patient?.email, "Unknown")}`,
        html: bookingChangedClinicianEmail({
          patientName: displayName(patient?.name, patient?.email, "Unknown"),
          patientEmail: patient?.email ?? "",
          headline: byPatient
            ? "A patient cancelled their appointment."
            : "An appointment was cancelled by the clinic.",
          detailLines: [
            `When: ${whenLabel}`,
            sessionLabel,
            booking.lateCancellation ? "Late cancellation — inside the notice window." : "Cancelled with notice.",
            ...(reason ? [`Reason given: ${reason}`] : []),
          ],
          adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${booking.userId}`,
        }),
        attachments,
      });
    }
  }, "[api/bookings/id] cancellation emails failed:");
}

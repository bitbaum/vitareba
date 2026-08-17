export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { bookings, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { bookingRequestAdminEmail, bookingConfirmedEmail } from "@/lib/email/templates";
import { PORTAL_URL, COMPANY, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { USER_ROLE } from "@/lib/config/auth";
import { bookingCreateSchema, adminBookingCreateSchema, slotBookingSchema } from "@/lib/domain/bookings";
import { getClinicianAvailability } from "@/lib/domain/clinician-profile";
import { isBookableSlot } from "@/lib/domain/scheduling";
import { getBusyIntervals } from "@/lib/domain/scheduling-data";
import { canPatientChooseClinician } from "@/lib/domain/care-team";
import { buildIcsInvite } from "@/lib/domain/ics";
import { bookingIcsEvent } from "@/lib/domain/booking-calendar";

import { BOOKING_STATUS, BOOKING_TYPE_CONFIG, MACHINE_TYPE_CONFIG } from "@/lib/config/booking-status";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { displayName, formatDateISO, formatSlotDay, formatSlotTime } from "@/lib/utils/format";
import { createNotification, createNotificationForMany } from "@/lib/domain/notifications";
import { NOTIFICATION_TYPE } from "@/lib/config/notifications";

/** In-app recipients for "a booking happened" — DB admin-role users, not the
 *  env-driven ADMIN_EMAILS list (that's for email; notifications need a userId). */
async function getAdminUserIds(): Promise<string[]> {
  const rows = await db.query.users.findMany({
    where: eq(users.role, USER_ROLE.admin),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const where = session.user.role === USER_ROLE.admin
    ? undefined
    : eq(bookings.userId, session.user.id);

  let results;
  try {
    results = await db.query.bookings.findMany({
      where,
      orderBy: [desc(bookings.createdAt)],
      with: {
        user: { columns: { id: true, name: true, email: true } },
        clinician: { columns: { id: true, name: true } },
      },
    });
  } catch (err) {
    console.error("[api/bookings] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: results });
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const isAdmin = session.user.role === USER_ROLE.admin;

  // ── Which kind of booking is this? ────────────────────────────────────────
  //
  // Decided by WHAT WAS ASKED FOR, never by who is asking. The route used to
  // branch on the role first, so an admin who picked a time in the patient
  // portal was routed into the "book for someone else" handler, which demands a
  // patientId the picker never sends — every such booking answered 400 "Invalid
  // data". This practice's clinicians are their own patients by design
  // (care_team exists for exactly that), so "the admin branch" swallowed the
  // ordinary case for every dual-role account. Nothing had ever been booked
  // with a real time on it.
  //
  // Role decides PERMISSION — who may book for someone other than themselves —
  // and nothing else.

  // ── An exact time, for me or (as an admin) for a named patient ────────────
  if (typeof (body as Record<string, unknown>)?.slot === "string") {
    return bookSlot(body, session, isAdmin);
  }

  // ── A booking on someone else's behalf, without a fixed time ──────────────
  if (typeof (body as Record<string, unknown>)?.patientId === "string") {
    if (!isAdmin) {
      // Not "forbidden field" — a patient has no business learning that booking
      // for other people is a thing this endpoint can do.
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }
    const parsed = adminBookingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }
    const { patientId, status, ...fields } = parsed.data;

    let booking: typeof bookings.$inferSelect;
    try {
      [booking] = await db
        .insert(bookings)
        .values({ userId: patientId, status: status ?? BOOKING_STATUS.confirmed, ...fields })
        .returning();
    } catch (err) {
      console.error("[api/bookings] admin insert failed:", err);
      return NextResponse.json({ success: false, error: "Failed to create booking — please try again" }, { status: 500 });
    }

    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, patientId),
        columns: { name: true, email: true },
      });
      if (!patient?.email) return;
      const bookingTypeLabel = BOOKING_TYPE_CONFIG[fields.bookingType ?? "consultation"].label;
      const machineLabel = fields.machineType ? MACHINE_TYPE_CONFIG[fields.machineType].label : null;
      const sessionLabel = machineLabel ? `${bookingTypeLabel} — ${machineLabel}` : bookingTypeLabel;
      await sendEmail({
        to: patient.email,
        subject: `Your ${sessionLabel.toLowerCase()} has been confirmed — ${COMPANY.shortName}`,
        html: bookingConfirmedEmail({
          patientName: displayName(patient.name, patient.email),
          sessionLabel,
          portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
        }),
      });
      await createNotification({
        userId: patientId,
        type: NOTIFICATION_TYPE.bookingConfirmed,
        title: `Your ${sessionLabel.toLowerCase()} is confirmed`,
        href: PORTAL_ROUTES.bookings,
      });
    }, "[api/bookings] patient confirmation email failed:");

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  }


  // ── Patient booking request ────────────────────────────────────────────────
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  let booking: typeof bookings.$inferSelect;
  try {
    [booking] = await db
      .insert(bookings)
      .values({ userId: session.user.id, ...parsed.data })
      .returning();
  } catch (err) {
    console.error("[api/bookings] insert failed:", err);
    return NextResponse.json({ success: false, error: "Failed to create booking — please try again" }, { status: 500 });
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0) {
    const bookingTypeLabel = BOOKING_TYPE_CONFIG[parsed.data.bookingType].label;
    const machineTypeLabel = parsed.data.machineType
      ? MACHINE_TYPE_CONFIG[parsed.data.machineType].label
      : null;
    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { name: true, email: true },
      });
      await sendEmail({
        to: adminEmails,
        subject: `New ${bookingTypeLabel.toLowerCase()} request — ${displayName(patient?.name, patient?.email ?? session.user.email)}`,
        html: bookingRequestAdminEmail({
          patientName: displayName(patient?.name, patient?.email, "Unknown"),
          patientEmail: patient?.email ?? "",
          bookingTypeLabel,
          machineTypeLabel,
          notes: parsed.data.notes,
          preferredDate: parsed.data.preferredDate,
          adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${session.user.id}`,
        }),
      });
      const adminIds = await getAdminUserIds();
      await createNotificationForMany(adminIds, {
        type: NOTIFICATION_TYPE.bookingRequested,
        title: `New ${bookingTypeLabel.toLowerCase()} request — ${displayName(patient?.name, patient?.email, "Unknown")}`,
        href: `${ADMIN_ROUTES.patients}/${session.user.id}`,
      });
    }, "[api/bookings] admin booking request email failed:");
  }

  return NextResponse.json({ success: true, data: booking }, { status: 201 });
}


/**
 * Book one exact slot.
 *
 * The same path for everyone, because it is the same act: a time is chosen,
 * the engine is asked whether it is still real, and a row is written that the
 * database itself refuses to duplicate. Who the appointment is FOR is a
 * parameter, not a different function — the version that had two paths kept
 * only one of them working.
 */
async function bookSlot(
  body: unknown,
  session: { user: { id: string; email?: string | null; role?: string | null } },
  isAdmin: boolean
): Promise<NextResponse> {
    const slotParsed = slotBookingSchema.safeParse(body);
    if (!slotParsed.success) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }
    const slot = new Date(slotParsed.data.slot);
    const now = new Date();

    // Who the appointment is for. Booking for yourself needs no permission;
    // booking for someone else is an admin act, and a patient who tries it is
    // told nothing about the field existing.
    const requestedFor = slotParsed.data.patientId;
    if (requestedFor && requestedFor !== session.user.id && !isAdmin) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }
    const patientId = requestedFor ?? session.user.id;

    // The chosen doctor must exist and actually be a clinician
    let clinician;
    try {
      clinician = await db.query.users.findFirst({
        where: and(eq(users.id, slotParsed.data.clinicianId), eq(users.isClinician, true)),
        columns: { id: true, name: true, email: true },
      });
    } catch (err) {
      console.error("[api/bookings] clinician lookup failed:", err);
      return serviceUnavailable();
    }
    if (!clinician) {
      return NextResponse.json({ success: false, error: "Unknown clinician" }, { status: 400 });
    }

    // A patient starting a NEW relationship with a clinician who has closed
    // intake is refused here — the same rule the care-team picker enforces, so
    // "not accepting" means the same thing whichever door a patient tries.
    // Staff booking on a patient's behalf may override: a clinician can always
    // choose to make an exception, and that choice is the admin picking up the
    // phone, not a patient finding a workaround.
    if (!isAdmin) {
      try {
        const eligible = await canPatientChooseClinician(patientId, clinician.id);
        if (!eligible.ok) {
          return NextResponse.json({ success: false, error: eligible.error }, { status: 409 });
        }
      } catch (err) {
        console.error("[api/bookings] eligibility check failed:", err);
        return serviceUnavailable();
      }
    }

    // Engine re-check: the slot must still be one we'd offer right now
    const rules = await getClinicianAvailability(clinician.id);
    try {
      const busy = await getBusyIntervals(now, clinician.id, rules);
      if (!isBookableSlot(slot, { now, rules, busy })) {
        return NextResponse.json(
          { success: false, error: "This slot is no longer available", code: "slot_taken" },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("[api/bookings] slot re-check failed:", err);
      return serviceUnavailable();
    }

    let booking: typeof bookings.$inferSelect;
    try {
      [booking] = await db
        .insert(bookings)
        .values({
          userId: patientId,
          status: BOOKING_STATUS.confirmed,
          bookingType: slotParsed.data.bookingType,
          machineType: slotParsed.data.machineType,
          clinicianId: clinician.id,
          scheduledAt: slot,
          preferredDate: formatDateISO(slot),
          notes: slotParsed.data.notes,
        })
        .returning();
    } catch (err) {
      // Two patients picked the same slot — the partial unique index on
      // scheduled_at rejects the loser. Surface it as "taken", not a 500.
      if ((err as { code?: string })?.code === "23505") {
        return NextResponse.json(
          { success: false, error: "This slot was just taken — please pick another", code: "slot_taken" },
          { status: 409 }
        );
      }
      console.error("[api/bookings] slot insert failed:", err);
      return NextResponse.json({ success: false, error: "Failed to book — please try again" }, { status: 500 });
    }

    const bookingTypeLabel = BOOKING_TYPE_CONFIG[slotParsed.data.bookingType].label;
    const machineLabel = slotParsed.data.machineType
      ? MACHINE_TYPE_CONFIG[slotParsed.data.machineType].label
      : null;
    const sessionLabel = machineLabel ? `${bookingTypeLabel} — ${machineLabel}` : bookingTypeLabel;
    const slotLabel = `${formatSlotDay(slot)}, ${formatSlotTime(slot)} with ${displayName(clinician.name, clinician.email)}`;

    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, patientId),
        columns: { name: true, email: true },
      });

      // The appointment as a calendar invite. Attaching it is what turns a
      // confirmation email into a calendar entry in one tap — on any provider,
      // with no integration to configure.
      const invite = patient?.email
        ? buildIcsInvite(
            bookingIcsEvent({
              bookingId: booking.id,
              start: slot,
              slotMinutes: rules.slotMinutes,
              status: BOOKING_STATUS.confirmed,
              patient: { name: patient.name, email: patient.email },
              clinician: { name: clinician.name, email: clinician.email },
              sessionLabel,
              createdAt: booking.createdAt,
            })
          )
        : null;
      const attachments = invite
        ? [{ filename: "appointment.ics", content: invite, contentType: "text/calendar; method=REQUEST" }]
        : undefined;

      if (patient?.email) {
        await sendEmail({
          to: patient.email,
          subject: `Confirmed: ${sessionLabel.toLowerCase()} on ${slotLabel} — ${COMPANY.shortName}`,
          html: bookingConfirmedEmail({
            patientName: displayName(patient.name, patient.email),
            sessionLabel: `${sessionLabel} · ${slotLabel}`,
            portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
          }),
          attachments,
        });
      }
      await createNotification({
        userId: patientId,
        type: NOTIFICATION_TYPE.bookingConfirmed,
        title: `Confirmed: ${sessionLabel.toLowerCase()} on ${slotLabel}`,
        href: PORTAL_ROUTES.bookings,
      });

      // Notify the clinician whose calendar this lands in — not just whoever
      // happens to be in ADMIN_EMAILS. Admins still get it (clinic oversight),
      // deduplicated so a clinician who is also an admin isn't emailed twice.
      const recipients = Array.from(
        new Set([clinician.email, ...getAdminEmails()].map((e) => e.toLowerCase()))
      );
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          subject: `New appointment: ${slotLabel} — ${displayName(patient?.name, patient?.email ?? session.user.email ?? undefined)}`,
          html: bookingRequestAdminEmail({
            patientName: displayName(patient?.name, patient?.email, "Unknown"),
            patientEmail: patient?.email ?? "",
            bookingTypeLabel: `${bookingTypeLabel} (booked slot: ${slotLabel})`,
            machineTypeLabel: machineLabel,
            notes: slotParsed.data.notes,
            preferredDate: formatDateISO(slot),
            adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${patientId}`,
          }),
          attachments,
        });
      }
      const adminIds = await getAdminUserIds();
      await createNotificationForMany(Array.from(new Set([clinician.id, ...adminIds])), {
        type: NOTIFICATION_TYPE.bookingConfirmed,
        title: `New appointment: ${slotLabel} — ${displayName(patient?.name, patient?.email, "Unknown")}`,
        href: `${ADMIN_ROUTES.patients}/${patientId}`,
      });
    }, "[api/bookings] slot booking emails failed:");

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
}
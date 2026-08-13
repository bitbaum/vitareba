export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { bookings, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { bookingRequestAdminEmail, bookingConfirmedEmail } from "@/lib/email/templates";
import { PORTAL_URL, COMPANY, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { USER_ROLE } from "@/lib/config/auth";
import { bookingCreateSchema, adminBookingCreateSchema, slotBookingSchema } from "@/lib/domain/bookings";
import { isBookableSlot } from "@/lib/domain/scheduling";
import { getBusyIntervals } from "@/lib/domain/scheduling-data";

import { BOOKING_STATUS, BOOKING_TYPE_CONFIG, MACHINE_TYPE_CONFIG } from "@/lib/config/booking-status";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { displayName, formatDateISO, formatSlotDay, formatSlotTime } from "@/lib/utils/format";

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
      with: { user: { columns: { id: true, name: true, email: true } } },
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

  // ── Admin-initiated booking (for a specific patient) ───────────────────────
  if (session.user.role === USER_ROLE.admin) {
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
    }, "[api/bookings] patient confirmation email failed:");

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
  }

  // ── Patient slot booking (exact time, instantly confirmed) ─────────────────
  if (typeof (body as Record<string, unknown>)?.slot === "string") {
    const slotParsed = slotBookingSchema.safeParse(body);
    if (!slotParsed.success) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }
    const slot = new Date(slotParsed.data.slot);
    const now = new Date();

    // Engine re-check: the slot must still be one we'd offer right now
    try {
      const busy = await getBusyIntervals(now);
      if (!isBookableSlot(slot, { now, busy })) {
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
          userId: session.user.id,
          status: BOOKING_STATUS.confirmed,
          bookingType: slotParsed.data.bookingType,
          machineType: slotParsed.data.machineType,
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
    const slotLabel = `${formatSlotDay(slot)}, ${formatSlotTime(slot)}`;

    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { name: true, email: true },
      });
      if (patient?.email) {
        await sendEmail({
          to: patient.email,
          subject: `Confirmed: ${sessionLabel.toLowerCase()} on ${slotLabel} — ${COMPANY.shortName}`,
          html: bookingConfirmedEmail({
            patientName: displayName(patient.name, patient.email),
            sessionLabel: `${sessionLabel} · ${slotLabel}`,
            portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.bookings}`,
          }),
        });
      }
      const adminEmails = getAdminEmails();
      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          subject: `New appointment: ${slotLabel} — ${displayName(patient?.name, patient?.email ?? session.user.email)}`,
          html: bookingRequestAdminEmail({
            patientName: displayName(patient?.name, patient?.email, "Unknown"),
            patientEmail: patient?.email ?? "",
            bookingTypeLabel: `${bookingTypeLabel} (booked slot: ${slotLabel})`,
            machineTypeLabel: machineLabel,
            notes: slotParsed.data.notes,
            preferredDate: formatDateISO(slot),
            adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${session.user.id}`,
          }),
        });
      }
    }, "[api/bookings] slot booking emails failed:");

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
    }, "[api/bookings] admin booking request email failed:");
  }

  return NextResponse.json({ success: true, data: booking }, { status: 201 });
}

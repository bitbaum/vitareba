export const dynamic = "force-dynamic";

import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, users } from "@/lib/db/schema";
import {
  BOOKING_STATUS,
  BOOKING_TYPE_CONFIG,
  type BookingStatus,
  type BookingType,
} from "@/lib/config/booking-status";
import { COMPANY } from "@/lib/config/company";
import { CALENDAR_FEED_PAST_DAYS } from "@/lib/config/scheduling";
import { getClinicianAvailability } from "@/lib/domain/clinician-profile";
import { buildIcsFeed, type IcsEvent } from "@/lib/domain/ics";
import { bookingIcsEvent } from "@/lib/domain/booking-calendar";
import { verifyCalendarToken } from "@/lib/domain/calendar-token";
import { UUID_RE } from "@/lib/utils/validate";

type RouteContext = { params: Promise<{ id: string; token: string }> };

/**
 * A clinician's appointments as a subscribable calendar.
 *
 * Unauthenticated BY NECESSITY — calendar clients send no cookies — so the
 * HMAC token in the path is the credential (see lib/domain/calendar-token.ts).
 * Wrong token must look exactly like an unknown URL: a 401 would confirm that
 * the id belongs to a real clinician.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id, token } = await params;
  const clean = token.replace(/\.ics$/, "");

  if (!UUID_RE.test(id) || !verifyCalendarToken(id, clean)) {
    return new Response("Not found", { status: 404 });
  }

  let clinician: { name: string | null; email: string } | undefined;
  let rows: {
    id: string;
    scheduledAt: Date | null;
    status: BookingStatus;
    bookingType: BookingType;
    createdAt: Date;
    user: { name: string | null; email: string };
  }[];

  try {
    clinician = await db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.isClinician, true)),
      columns: { name: true, email: true },
    });
    if (!clinician) return new Response("Not found", { status: 404 });

    const since = new Date(Date.now() - CALENDAR_FEED_PAST_DAYS * 24 * 60 * 60 * 1000);
    rows = await db.query.bookings.findMany({
      where: and(
        eq(bookings.clinicianId, id),
        gte(bookings.scheduledAt, since),
        inArray(bookings.status, [
          BOOKING_STATUS.pending,
          BOOKING_STATUS.confirmed,
          BOOKING_STATUS.attended,
          // Cancelled rows are included on purpose: a subscribed calendar only
          // drops an entry when it is published as CANCELLED, otherwise a
          // cancelled appointment lingers in the clinician's calendar forever.
          BOOKING_STATUS.cancelled,
        ]),
      ),
      columns: { id: true, scheduledAt: true, status: true, bookingType: true, createdAt: true },
      with: { user: { columns: { name: true, email: true } } },
    });
  } catch (err) {
    console.error("[api/calendar] feed failed:", err);
    return new Response("Calendar temporarily unavailable", { status: 503 });
  }

  const slotMinutes = (await getClinicianAvailability(id)).slotMinutes;

  const clinicianContact = clinician;
  const events: IcsEvent[] = rows
    .filter((b): b is typeof b & { scheduledAt: Date } => b.scheduledAt !== null)
    .map((b) =>
      bookingIcsEvent({
        bookingId: b.id,
        start: b.scheduledAt,
        slotMinutes,
        status: b.status,
        patient: b.user,
        clinician: clinicianContact,
        sessionLabel: BOOKING_TYPE_CONFIG[b.bookingType]?.label ?? "Consultation",
        createdAt: b.createdAt,
      }),
    );

  const body = buildIcsFeed(events, `${COMPANY.shortName} — ${clinician.name ?? "Clinic"}`);

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": 'inline; filename="vitareba.ics"',
    },
  });
}

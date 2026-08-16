export const dynamic = "force-dynamic";

/**
 * A clinician's own calendar subscriptions.
 *
 * THE SECRET URL NEVER COMES BACK OUT. Anyone holding it can read that person's
 * entire calendar forever — it is a credential, not a setting. It goes in once
 * and is returned only as a masked hint ("calendar.google.com/…/basic.ics") so
 * the owner can tell two entries apart without the value being present in a
 * page, a browser history, or a screenshot.
 *
 * Only clinicians may subscribe a calendar, and only their own: `isClinician` is
 * what makes a person bookable, so it is exactly the set of people whose free
 * time the engine consults.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { clinicianCalendars, users } from "@/lib/db/schema";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import {
  CALENDAR_LABEL_MAX,
  CALENDAR_MAX_PER_CLINICIAN,
} from "@/lib/config/calendar-sync";
import { normaliseCalendarUrl } from "@/lib/domain/calendar-fetch";
import { syncOneCalendar } from "@/lib/domain/calendar-sync";
import { USER_ROLE } from "@/lib/config/auth";

const createSchema = z.object({
  label: z.string().trim().min(1).max(CALENDAR_LABEL_MAX),
  icsUrl: z.string().min(1),
  /** Admins may add a calendar for another clinician; everyone else, only their own. */
  clinicianId: z.string().uuid().optional(),
});

/** Enough of the URL to tell two entries apart, and no more. */
function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const tail = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return `${u.hostname}/…/${tail.slice(-12)}`;
  } catch {
    return "hidden";
  }
}

const notFound = () => NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

async function resolveOwner(
  session: { user: { id: string; role?: string | null } },
  requested?: string
): Promise<{ ok: true; clinicianId: string } | { ok: false; res: NextResponse }> {
  const isAdmin = session.user.role === USER_ROLE.admin;
  const clinicianId = requested ?? session.user.id;
  if (clinicianId !== session.user.id && !isAdmin) return { ok: false, res: notFound() };

  const clinician = await db.query.users.findFirst({
    where: and(eq(users.id, clinicianId), eq(users.isClinician, true)),
    columns: { id: true },
  });
  if (!clinician) {
    return {
      ok: false,
      res: badRequest("Calendars belong to clinicians — this account does not take bookings."),
    };
  }
  return { ok: true, clinicianId };
}

export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const requested = new URL(req.url).searchParams.get("clinicianId") ?? undefined;
  let owner;
  try {
    owner = await resolveOwner(guard.session, requested ?? undefined);
  } catch (err) {
    console.error("[api/calendars] owner lookup failed:", err);
    return serviceUnavailable();
  }
  if (!owner.ok) return owner.res;

  try {
    const rows = await db.query.clinicianCalendars.findMany({
      where: eq(clinicianCalendars.clinicianId, owner.clinicianId),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        label: r.label,
        // Masked, never the value itself.
        urlHint: maskUrl(r.icsUrl),
        active: r.active,
        lastFetchedAt: r.lastFetchedAt,
        lastError: r.lastError,
        lastEventCount: r.lastEventCount,
      })),
    });
  } catch (err) {
    console.error("[api/calendars] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest("A name and a calendar link are both needed.");

  const normalised = normaliseCalendarUrl(parsed.data.icsUrl);
  if (!normalised.ok) return badRequest(normalised.error);

  let owner;
  try {
    owner = await resolveOwner(guard.session, parsed.data.clinicianId);
  } catch (err) {
    console.error("[api/calendars] owner lookup failed:", err);
    return serviceUnavailable();
  }
  if (!owner.ok) return owner.res;

  let created;
  try {
    const existing = await db.query.clinicianCalendars.findMany({
      where: eq(clinicianCalendars.clinicianId, owner.clinicianId),
      columns: { id: true },
    });
    if (existing.length >= CALENDAR_MAX_PER_CLINICIAN) {
      return badRequest(`That is the most calendars one clinician can subscribe (${CALENDAR_MAX_PER_CLINICIAN}).`);
    }

    [created] = await db
      .insert(clinicianCalendars)
      .values({
        clinicianId: owner.clinicianId,
        label: parsed.data.label.trim(),
        icsUrl: normalised.url,
      })
      .returning();
  } catch (err) {
    console.error("[api/calendars] insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not save that calendar — please try again" },
      { status: 500 }
    );
  }

  // Sync immediately, so adding a calendar either works in front of the person
  // who added it or tells them why not. A subscription that silently does
  // nothing until the next cron is indistinguishable from a broken one.
  const outcome = await syncOneCalendar({
    id: created.id,
    clinicianId: created.clinicianId,
    label: created.label,
    icsUrl: created.icsUrl,
  }).catch((err) => {
    console.error("[api/calendars] first sync failed:", err);
    return { calendarId: created.id, label: created.label, ok: false, intervals: 0, error: "Could not read that calendar." };
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: created.id,
        label: created.label,
        urlHint: maskUrl(created.icsUrl),
        active: created.active,
        synced: outcome.ok,
        intervals: outcome.intervals,
        error: outcome.ok ? null : outcome.error,
      },
    },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return badRequest("Invalid calendar id");

  let row;
  try {
    row = await db.query.clinicianCalendars.findFirst({
      where: eq(clinicianCalendars.id, id),
      columns: { id: true, clinicianId: true },
    });
  } catch (err) {
    console.error("[api/calendars] lookup failed:", err);
    return serviceUnavailable();
  }
  if (!row) return notFound();

  const isAdmin = guard.session.user.role === USER_ROLE.admin;
  if (row.clinicianId !== guard.session.user.id && !isAdmin) return notFound();

  try {
    // Cached busy rows go with it through the cascade — an unsubscribed calendar
    // must stop blocking slots immediately, not at the next sync.
    await db.delete(clinicianCalendars).where(eq(clinicianCalendars.id, id));
  } catch (err) {
    console.error("[api/calendars] delete failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not remove that calendar — please try again" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

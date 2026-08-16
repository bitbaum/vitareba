/**
 * Keeping the cached busy time in step with a clinician's real calendar.
 *
 * The whole job: fetch each subscribed feed, turn it into intervals, and replace
 * that calendar's cached rows. Replace, not merge — a meeting that was deleted
 * upstream must stop blocking a slot, and merging can only ever add.
 *
 * FAILURE IS PER-CALENDAR AND FAILS SAFE. One unreachable host must not stop the
 * others, and must not empty its own cache: if we cannot reach a calendar, we do
 * NOT know that its owner is free. Keeping yesterday's busy times offers at
 * worst a slot that has since freed up; deleting them offers every hour the
 * clinician is actually in a meeting. The error is recorded so a permanently
 * broken feed is visible rather than silently permissive.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarBusy, clinicianCalendars } from "@/lib/db/schema";
import { fetchCalendarText } from "@/lib/domain/calendar-fetch";
import { parseBusyIntervals, type BusyInterval } from "@/lib/domain/ics-parse";
import { CALENDAR_SYNC_HORIZON_DAYS } from "@/lib/config/calendar-sync";
import { DAY_MS } from "@/lib/utils/format";

export type CalendarSyncOutcome = {
  calendarId: string;
  label: string;
  ok: boolean;
  intervals: number;
  error?: string;
};

export type CalendarSyncResult = {
  synced: number;
  failed: number;
  outcomes: CalendarSyncOutcome[];
};

/** Refresh one calendar. Exported so "test this link" and the cron share a path. */
export async function syncOneCalendar(
  calendar: { id: string; clinicianId: string; label: string; icsUrl: string },
  now = new Date()
): Promise<CalendarSyncOutcome> {
  const windowStart = new Date(now.getTime() - DAY_MS);
  const windowEnd = new Date(now.getTime() + CALENDAR_SYNC_HORIZON_DAYS * DAY_MS);

  const fetched = await fetchCalendarText(calendar.icsUrl);
  if (!fetched.ok) {
    await recordFailure(calendar.id, fetched.error);
    return { calendarId: calendar.id, label: calendar.label, ok: false, intervals: 0, error: fetched.error };
  }

  let intervals: BusyInterval[];
  try {
    intervals = parseBusyIntervals(fetched.text, { windowStart, windowEnd });
  } catch (err) {
    const message = "That calendar could not be read.";
    console.error("[calendar-sync] parse failed:", err);
    await recordFailure(calendar.id, message);
    return { calendarId: calendar.id, label: calendar.label, ok: false, intervals: 0, error: message };
  }

  try {
    await replaceBusy(calendar, intervals, windowStart, windowEnd, now);
  } catch (err) {
    console.error("[calendar-sync] store failed:", err);
    const message = "Could not store this calendar's times.";
    await recordFailure(calendar.id, message).catch(() => {});
    return { calendarId: calendar.id, label: calendar.label, ok: false, intervals: 0, error: message };
  }

  return { calendarId: calendar.id, label: calendar.label, ok: true, intervals: intervals.length };
}

/**
 * Swap this calendar's cached window for the freshly parsed one, in a single
 * transaction. Without the transaction there is a moment where the clinician
 * looks completely free, and a patient booking in that moment lands on top of
 * a real meeting.
 */
async function replaceBusy(
  calendar: { id: string; clinicianId: string },
  intervals: BusyInterval[],
  windowStart: Date,
  windowEnd: Date,
  now: Date
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(calendarBusy)
      .where(
        and(
          eq(calendarBusy.calendarId, calendar.id),
          gte(calendarBusy.endsAt, windowStart),
          lte(calendarBusy.startsAt, windowEnd)
        )
      );

    if (intervals.length > 0) {
      await tx.insert(calendarBusy).values(
        intervals.map((i) => ({
          calendarId: calendar.id,
          clinicianId: calendar.clinicianId,
          startsAt: i.start,
          endsAt: i.end,
        }))
      );
    }

    await tx
      .update(clinicianCalendars)
      .set({ lastFetchedAt: now, lastError: null, lastEventCount: intervals.length })
      .where(eq(clinicianCalendars.id, calendar.id));
  });
}

/**
 * Record why a calendar could not be read — and deliberately DO NOT clear its
 * cached busy times. An unreachable calendar is not an empty one.
 */
async function recordFailure(calendarId: string, error: string): Promise<void> {
  await db
    .update(clinicianCalendars)
    .set({ lastFetchedAt: new Date(), lastError: error })
    .where(eq(clinicianCalendars.id, calendarId));
}

/** Refresh every active calendar. Used by the cron and by "sync now". */
export async function syncAllCalendars(now = new Date()): Promise<CalendarSyncResult> {
  const calendars = await db.query.clinicianCalendars.findMany({
    where: eq(clinicianCalendars.active, true),
    columns: { id: true, clinicianId: true, label: true, icsUrl: true },
  });

  const outcomes: CalendarSyncOutcome[] = [];
  // Sequential on purpose: this runs on a shared box against third-party hosts,
  // and a burst of parallel fetches is how you get rate-limited by all of them
  // at once. A handful of calendars every quarter hour does not need speed.
  for (const calendar of calendars) {
    outcomes.push(await syncOneCalendar(calendar, now));
  }

  return {
    synced: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
  };
}

/**
 * Cached busy intervals for these clinicians from `from` onward.
 * Reads the cache only — never the network — so slot generation stays fast and
 * keeps working when a calendar host is down.
 */
export async function getExternalBusy(
  clinicianIds: string[],
  from: Date
): Promise<BusyInterval[]> {
  if (clinicianIds.length === 0) return [];
  const rows = await db.query.calendarBusy.findMany({
    where: and(
      inArray(calendarBusy.clinicianId, clinicianIds),
      gte(calendarBusy.endsAt, from)
    ),
    columns: { startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({ start: r.startsAt, end: r.endsAt }));
}

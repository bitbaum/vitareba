/**
 * Slot engine — pure, injectable, timezone-correct.
 *
 * Generates bookable appointment slots from the WEEKLY_HOURS rules
 * (lib/config/scheduling.ts) minus busy intervals (today: active bookings;
 * later: external calendar free/busy feeds the same parameter).
 *
 * All wall-clock rules are interpreted in CLINIC_TIMEZONE, so a 09:00 slot is
 * 09:00 in Zürich regardless of server timezone or DST.
 */

import { CLINIC_TIMEZONE } from "@/lib/config/company";
import {
  WEEKLY_HOURS,
  SLOT_MINUTES,
  BUFFER_MINUTES,
  LEAD_TIME_HOURS,
  HORIZON_DAYS,
  MAX_PER_DAY,
} from "@/lib/config/scheduling";
import { DAY_MS, HOUR_MS, formatDateISO } from "@/lib/utils/format";

const MINUTE_MS = 60 * 1000;

export type BusyInterval = { start: Date; end: Date };

// ── Timezone helpers ─────────────────────────────────────────────────────────

const OFFSET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIMEZONE,
  timeZoneName: "longOffset",
});

/** UTC offset (ms) of CLINIC_TIMEZONE at the given instant, e.g. +2h in CEST. */
function clinicOffsetMs(at: Date): number {
  const name = OFFSET_FMT.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // "GMT" exactly = UTC
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * HOUR_MS + Number(m[3]) * MINUTE_MS);
}

/**
 * Convert clinic wall-clock time to a UTC instant. Two-pass: guess with the
 * offset at the naive instant, then correct with the offset at the guess —
 * stable everywhere except inside a DST jump hour, which WEEKLY_HOURS
 * windows (daytime) never touch.
 */
function clinicTimeToUtc(dateISO: string, time: string): Date {
  const naive = new Date(`${dateISO}T${time}:00Z`);
  const guess = new Date(naive.getTime() - clinicOffsetMs(naive));
  return new Date(naive.getTime() - clinicOffsetMs(guess));
}

/** ISO weekday (1 = Mon … 7 = Sun) of the given clinic-timezone date. */
function isoWeekday(dateISO: string): number {
  // Noon UTC avoids any date shift from the weekday formatter's timezone
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// ── Slot generation ──────────────────────────────────────────────────────────

export type GenerateSlotsInput = {
  now: Date;
  /** Intervals that block slots — active bookings, later external calendars. */
  busy: BusyInterval[];
};

/**
 * All bookable slot starts, ascending. A slot is offered when:
 *  - it lies inside a WEEKLY_HOURS window (slot + buffer must fit),
 *  - it starts at least LEAD_TIME_HOURS from now, within HORIZON_DAYS,
 *  - it doesn't overlap any busy interval (buffer included),
 *  - its clinic day has fewer than MAX_PER_DAY busy appointments already.
 */
export function generateSlots({ now, busy }: GenerateSlotsInput): Date[] {
  const earliest = now.getTime() + LEAD_TIME_HOURS * HOUR_MS;
  const latest = now.getTime() + HORIZON_DAYS * DAY_MS;
  const slotSpanMs = (SLOT_MINUTES + BUFFER_MINUTES) * MINUTE_MS;

  // Busy appointments per clinic day, for the MAX_PER_DAY cap
  const busyPerDay = new Map<string, number>();
  for (const b of busy) {
    const day = formatDateISO(b.start);
    busyPerDay.set(day, (busyPerDay.get(day) ?? 0) + 1);
  }

  const slots: Date[] = [];
  const seenDays = new Set<string>();
  for (let dayOffset = 0; dayOffset <= HORIZON_DAYS; dayOffset++) {
    const dayISO = formatDateISO(new Date(now.getTime() + dayOffset * DAY_MS));
    // +24h steps can revisit a clinic date across a fall-back DST shift
    if (seenDays.has(dayISO)) continue;
    seenDays.add(dayISO);
    const windows = WEEKLY_HOURS[isoWeekday(dayISO)] ?? [];
    if (windows.length === 0) continue;
    if ((busyPerDay.get(dayISO) ?? 0) >= MAX_PER_DAY) continue;

    for (const [start, end] of windows) {
      const windowStart = clinicTimeToUtc(dayISO, start);
      const windowEnd = clinicTimeToUtc(dayISO, end);

      for (
        let t = windowStart.getTime();
        t + slotSpanMs <= windowEnd.getTime();
        t += slotSpanMs
      ) {
        if (t < earliest || t > latest) continue;
        const slotEnd = t + slotSpanMs;
        const conflict = busy.some((b) => t < b.end.getTime() && slotEnd > b.start.getTime());
        if (!conflict) slots.push(new Date(t));
      }
    }
  }
  return slots;
}

/** Busy interval a booked slot occupies (appointment + buffer). */
export function slotBusyInterval(scheduledAt: Date): BusyInterval {
  return {
    start: scheduledAt,
    end: new Date(scheduledAt.getTime() + (SLOT_MINUTES + BUFFER_MINUTES) * MINUTE_MS),
  };
}

/** True when the requested slot is one the engine currently offers. */
export function isBookableSlot(slot: Date, input: GenerateSlotsInput): boolean {
  return generateSlots(input).some((s) => s.getTime() === slot.getTime());
}

// Date formatting utilities — SSOT for locale + format decisions

import { CLINIC_TIMEZONE } from "@/lib/config/company";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const LOCALE = "en-GB";

/** "2 Apr 2025" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

/** "2 April 2025" */
export function formatDateLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** "02/04/2025" (numeric DD/MM/YYYY) */
export function formatDateNumeric(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE);
}

/** "2 Apr, 10:30" — for message timestamps */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2 Apr" — for chart axis labels where year is omitted for compactness */
export function formatDateMonthDay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

// en-CA is the one locale whose default date format IS "YYYY-MM-DD"
const CLINIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * ISO date string "YYYY-MM-DD" in the clinic's timezone — for DB date column
 * comparisons. NOT toISOString(): that is UTC, which put a 00:30-Zürich
 * check-in on yesterday's date (overwriting it and breaking streaks).
 */
export function formatDateISO(date: Date): string {
  return CLINIC_DAY.format(date);
}

// Appointment slots are clinic wall time — a 09:30 slot must read 09:30
// regardless of the server's or visitor's timezone.
const SLOT_DAY = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CLINIC_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const SLOT_TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CLINIC_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "Mon 17 Aug" — clinic-timezone day label for a slot group. */
export function formatSlotDay(date: Date | string): string {
  return SLOT_DAY.format(typeof date === "string" ? new Date(date) : date);
}

/** "09:30" — clinic-timezone time label for a slot. */
export function formatSlotTime(date: Date | string): string {
  return SLOT_TIME.format(typeof date === "string" ? new Date(date) : date);
}

/**
 * "Mon 17 Aug, 17:00" — THE way to write an appointment, everywhere.
 *
 * There were three. The dashboard said "17 August 2026", the bookings list said
 * "Mon 17 Aug, 17:00", and the line under it said "16/08/2026" — three formats
 * on two screens describing the same kind of thing, which makes a product feel
 * assembled rather than designed.
 *
 * Two things are load-bearing here and neither is cosmetic:
 *   • THE TIME IS PART OF IT. An appointment without a time is not an
 *     appointment, and the dashboard was omitting it.
 *   • CLINIC TIMEZONE, always. The general date helpers format in the runtime's
 *     zone, which on the box is UTC — so a 00:30 Zürich appointment renders on
 *     the previous day. Wrong day, to a patient, about a medical appointment.
 */
export function formatAppointment(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${formatSlotDay(d)}, ${formatSlotTime(d)}`;
}

const SLOT_PARTS = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CLINIC_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  // h23, not hour12:false — some locales render midnight as "24" under the
  // latter, which would fall outside every day part.
  hourCycle: "h23",
});

/**
 * A slot broken into its display pieces — the date rail needs weekday, day
 * number and month separately, and grouping by part of day needs the clinic
 * hour (NOT the visitor's: a 09:30 Zürich slot must group as morning even for
 * a patient reading the page from Tokyo).
 */
export function slotParts(date: Date | string): {
  weekday: string;
  day: string;
  month: string;
  hour: number;
} {
  const parts = SLOT_PARTS.formatToParts(typeof date === "string" ? new Date(date) : date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: pick("weekday"),
    day: pick("day"),
    month: pick("month"),
    hour: Number(pick("hour")),
  };
}

/**
 * Human-readable relative date label for admin lists: "Today", "Yesterday", "Nd ago".
 * Accepts an ISO date string (YYYY-MM-DD) and a reference Date for testability.
 */
export function relativeDate(dateStr: string, now: Date): string {
  // Compare calendar dates, not timestamps — both parsed as UTC midnight so
  // the diff is an exact whole number of days in any server timezone.
  const days = Math.round((Date.parse(formatDateISO(now)) - Date.parse(dateStr)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

/**
 * "3m ago" / "2h ago" / "5d ago" — timestamp-level relative time, not the
 * calendar-day granularity of `relativeDate`. For the notification bell,
 * where "just now" vs. "20 minutes ago" is the whole point of the list.
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(date);
}

/**
 * Returns the patient's display name: their name if set, otherwise the
 * local part of their email address, otherwise the fallback string.
 * Used wherever a human-readable name is needed for emails and alerts.
 */
export function displayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "there",
): string {
  return name ?? email?.split("@")[0] ?? fallback;
}

/**
 * Capitalises the first character for sentence-initial use.
 *
 * Exists because clinician labels are resolved at runtime and may be a real
 * name ("Manuel" — unchanged) or the neutral fallback ("your clinician" →
 * "Your clinician"). Copy that starts a sentence with one must not depend on
 * which it got.
 */
export function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

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
  return d.toLocaleString(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
 * Returns the patient's display name: their name if set, otherwise the
 * local part of their email address, otherwise the fallback string.
 * Used wherever a human-readable name is needed for emails and alerts.
 */
export function displayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "there"
): string {
  return name ?? email?.split("@")[0] ?? fallback;
}

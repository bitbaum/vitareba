/**
 * Scheduling — SSOT for clinician availability.
 *
 * Multi-clinician: every doctor (users.isClinician) gets bookable slots from
 * these rules minus their own booked appointments (per-clinician partial
 * unique index on bookings makes double-booking impossible). Rules are keyed
 * by the clinician's account email — adding or changing a doctor's hours is
 * an edit to THIS file only; anyone without an entry gets DEFAULT_AVAILABILITY.
 *
 * All times are wall-clock in CLINIC_TIMEZONE (lib/config/company.ts).
 * External calendar free/busy (CalDAV / Google) plugs into the engine's
 * busy-interval input later — no changes here.
 */

export type WeeklyHours = Record<number, [string, string][]>;

export type ClinicianAvailability = {
  /** ISO weekday (1 = Monday … 7 = Sunday) → working windows as [start, end) */
  weeklyHours: WeeklyHours;
  /** Appointment length offered to patients (minutes). */
  slotMinutes: number;
  /** Gap kept free after every appointment (notes, reset, overruns). */
  bufferMinutes: number;
  /** Earliest bookable slot, measured from "now" (hours). */
  leadTimeHours: number;
  /** How far into the future patients can book (days). */
  horizonDays: number;
  /** Hard cap on appointments per clinic day. */
  maxPerDay: number;
};

export const DEFAULT_AVAILABILITY: ClinicianAvailability = {
  weeklyHours: {
    1: [["09:00", "12:00"], ["13:30", "17:00"]],
    2: [["09:00", "12:00"], ["13:30", "17:00"]],
    3: [["09:00", "12:00"], ["13:30", "17:00"]],
    4: [["09:00", "12:00"], ["13:30", "17:00"]],
    5: [["09:00", "13:00"]],
    6: [],
    7: [],
  },
  slotMinutes: 30,
  bufferMinutes: 15,
  leadTimeHours: 12,
  horizonDays: 21,
  maxPerDay: 6,
};

/** Per-clinician overrides, keyed by account email (lowercase). */
export const CLINICIAN_AVAILABILITY: Record<string, Partial<ClinicianAvailability>> = {
  "manuel@surfyourlife.org": {},
  // George — evenings-and-Friday product-testing window
  "butaeff@gmail.com": {
    weeklyHours: {
      1: [["17:00", "19:00"]],
      2: [["17:00", "19:00"]],
      3: [["17:00", "19:00"]],
      4: [["17:00", "19:00"]],
      5: [["09:00", "12:00"]],
      6: [],
      7: [],
    },
  },
};

/**
 * How a day's slots are grouped in the picker. A patient scans "an afternoon
 * next week", not a flat list of 14 times — the boundaries are clinic wall
 * hours, so they line up with the availability windows above.
 */
export const DAY_PARTS = [
  { id: "morning", label: "Morning", untilHour: 12 },
  { id: "afternoon", label: "Afternoon", untilHour: 17 },
  { id: "evening", label: "Evening", untilHour: 24 },
] as const;

export type DayPartId = (typeof DAY_PARTS)[number]["id"];

/**
 * How much history the subscribable calendar feed carries. Long enough that a
 * client re-syncing after a break still sees (and can delete) recently
 * cancelled appointments; short enough that the feed stays small forever.
 */
export const CALENDAR_FEED_PAST_DAYS = 60;

export function getAvailabilityForEmail(email: string | null | undefined): ClinicianAvailability {
  const override = email ? CLINICIAN_AVAILABILITY[email.toLowerCase()] : undefined;
  return { ...DEFAULT_AVAILABILITY, ...override };
}

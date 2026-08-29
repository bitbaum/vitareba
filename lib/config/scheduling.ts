/**
 * Scheduling — SSOT for the DEFAULT clinician availability rules.
 *
 * Multi-clinician: every doctor (users.isClinician) gets bookable slots from
 * their own rules (lib/domain/clinician-profile.ts, self-service, DB-backed)
 * minus their own booked appointments (per-clinician partial unique index on
 * bookings makes double-booking impossible) and their real external calendar
 * busy time (lib/domain/calendar-sync.ts).
 *
 * DEFAULT_AVAILABILITY is what a clinician with no settings row yet gets —
 * every clinician starts here and edits their own real hours from their
 * clinician settings page. It used to also hold hand-authored per-email
 * overrides; one clinician's entry there was explicitly a placeholder
 * ("evenings-and-Friday product-testing window"), so every patient booking
 * against it was offered fake times a developer typed into source, not real
 * availability. Removed — real per-clinician hours now live in the database.
 *
 * All times are wall-clock in CLINIC_TIMEZONE (lib/config/company.ts).
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
    1: [
      ["09:00", "12:00"],
      ["13:30", "17:00"],
    ],
    2: [
      ["09:00", "12:00"],
      ["13:30", "17:00"],
    ],
    3: [
      ["09:00", "12:00"],
      ["13:30", "17:00"],
    ],
    4: [
      ["09:00", "12:00"],
      ["13:30", "17:00"],
    ],
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

/** ISO weekday (1=Mon…7=Sun) → display name — the weekly-hours editor's row labels. */
export const ISO_WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * How much history the subscribable calendar feed carries. Long enough that a
 * client re-syncing after a break still sees (and can delete) recently
 * cancelled appointments; short enough that the feed stays small forever.
 */
export const CALENDAR_FEED_PAST_DAYS = 60;

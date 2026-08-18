// Portal-wide constants — single source of truth for all magic numbers

/** How many recent assessments to load for delta calculation on the dashboard */
export const RECENT_ASSESSMENTS_LIMIT = 2;

/** How long (ms) to show a "Saved ✓" success indicator before resetting */
export const SAVED_FEEDBACK_MS = 3_000;

/** Async-save button label SSOT — used in every portal form submit button */
export const SAVING_LABEL = "Saving…" as const;
export const SAVED_LABEL = "Saved ✓" as const;

/** Daily check-in scale: 1 = worst, 5 = best (except stress: 1 = none, 5 = high) */
export const CHECKIN_SCALE_MIN = 1;
export const CHECKIN_SCALE_MAX = 5;

/**
 * SSOT for all five daily check-in metrics — keys, display labels, scale edge labels, chart
 * colours, and DIRECTION. `inverted` marks the metrics where a higher number is
 * worse (stress): every piece of maths that scores a day — the wellness
 * average, the post-check-in readout — reads it from here rather than
 * hand-writing the exception, which is how one of them ends up telling a
 * patient their worst day was their best.
 * Import from here; never redefine the list in components.
 * Adding a new metric: edit here + the DB schema (lib/db/schema.ts) only.
 */
export const CHECKIN_METRICS = [
  { key: "sleep",  label: "Sleep quality", shortLabel: "Sleep",  lowLabel: "Poor",      highLabel: "Excellent", color: "var(--purple)",    inverted: false },
  { key: "energy", label: "Energy level",  shortLabel: "Energy", lowLabel: "Drained",   highLabel: "Vibrant",   color: "var(--teal)",      inverted: false },
  { key: "mood",   label: "Mood",          shortLabel: "Mood",   lowLabel: "Low",       highLabel: "Great",     color: "var(--gold)",      inverted: false },
  { key: "focus",  label: "Focus",         shortLabel: "Focus",  lowLabel: "Scattered", highLabel: "Sharp",     color: "var(--teal-dark)", inverted: false },
  { key: "stress", label: "Stress level",  shortLabel: "Stress", lowLabel: "None",      highLabel: "High",      color: "var(--danger)",    inverted: true  },
] as const;

export type MetricKey = (typeof CHECKIN_METRICS)[number]["key"];

/** How many days of check-in history to fetch on the check-in page.
 *  Must be large enough to compute streaks accurately beyond the 100-day milestone. */
export const CHECKIN_HISTORY_DAYS = 110;

/**
 * Days of history the post-check-in readout averages to form "your baseline".
 * A week absorbs the weekday/weekend swing without being so long that a real
 * shift is buried in it.
 */
export const CHECKIN_BASELINE_DAYS = 7;

/**
 * How far a metric must move off the baseline before the readout calls it out.
 * On a 1–5 scale, half a point is the smallest move that is not just the noise
 * of a patient rounding their own morning.
 */
export const CHECKIN_MOVE_THRESHOLD = 0.5;

/** How many days of check-in history to display in the history list */
export const CHECKIN_DISPLAY_DAYS = 30;

/** How many days of check-in data to show in the dashboard mini trend widget */
export const DASHBOARD_TREND_DAYS = 14;

/** Exercise frequency valid values — SSOT tuple used for Zod validation and type derivation */
export const EXERCISE_FREQUENCY_VALUES = [
  "none",
  "light",
  "moderate",
  "regular",
  "intense",
] as const;

export type ExerciseFrequency = (typeof EXERCISE_FREQUENCY_VALUES)[number];

/** Exercise frequency options for select components — derived from EXERCISE_FREQUENCY_VALUES */
export const EXERCISE_FREQUENCY_OPTIONS: readonly { value: ExerciseFrequency; label: string }[] = [
  { value: "none", label: "None" },
  { value: "light", label: "Light (1–2× / week)" },
  { value: "moderate", label: "Moderate (3× / week)" },
  { value: "regular", label: "Regular (4–5× / week)" },
  { value: "intense", label: "Intense (daily / 2×/day)" },
];

/** Sleep hours range for the profile selector */
export const SLEEP_HOURS_MIN = 3;
export const SLEEP_HOURS_MAX = 12;

/** The 10 clinical fields that count toward profile completeness */
export const PROFILE_COMPLETION_FIELDS = [
  "dateOfBirth",
  "city",
  "occupation",
  "mainConcern",
  "goals",
  "diagnosisHistory",
  "currentMedications",
  "currentSupplements",
  "sleepHoursAvg",
  "exerciseFrequency",
] as const;

/** Human-readable labels for each profile completion field — used in the dashboard bar */
export const PROFILE_FIELD_LABELS: Record<(typeof PROFILE_COMPLETION_FIELDS)[number], string> = {
  dateOfBirth:        "Date of birth",
  city:               "City",
  occupation:         "Occupation",
  mainConcern:        "Main concern",
  goals:              "Goals",
  diagnosisHistory:   "Diagnosis history",
  currentMedications: "Medications",
  currentSupplements: "Supplements",
  sleepHoursAvg:      "Sleep average",
  exerciseFrequency:  "Exercise frequency",
};

/** Fraction of PROFILE_COMPLETION_FIELDS filled before admin is notified */
export const PROFILE_COMPLETION_THRESHOLD = 0.7;

/** Below this fraction the profile completeness indicator shows a warning color */
export const PROFILE_COMPLETION_LOWER_THRESHOLD = 0.3;

/** Below this percentage (0–100) the dashboard's next-step funnel nudges profile completion */
export const PROFILE_NUDGE_THRESHOLD = 70;

/** Maximum number of days of check-in history that can be requested via the API */
export const CHECKIN_FETCH_MAX_DAYS = 120;

/** Profile short-text field max lengths (Zod schema + form inputs) */
export const PROFILE_NAME_MAX_LENGTH = 200;
export const PROFILE_PHONE_MAX_LENGTH = 50;
export const PROFILE_DOB_MAX_LENGTH = 20;
export const PROFILE_CITY_MAX_LENGTH = 100;
export const PROFILE_OCCUPATION_MAX_LENGTH = 150;
export const PROFILE_REFERRAL_SOURCE_MAX_LENGTH = 500;

/** Message thread subject max length */
export const MESSAGE_SUBJECT_MAX_LENGTH = 200;

/** Message body max length (applies to both thread creation and replies) */
export const MESSAGE_BODY_MAX_LENGTH = 10_000;

/** Patient note body max length (admin-only clinical notes) */
export const PATIENT_NOTE_MAX_LENGTH = 5_000;

/** Daily check-in optional notes max length */
export const CHECKIN_NOTES_MAX_LENGTH = 1_000;

/** Post-check-in AI companion: one message's max length (Zod schema + textarea) */
export const CHECKIN_CHAT_MESSAGE_MAX_LENGTH = 2_000;

/**
 * Max turns (user + assistant) sent in one conversation. The client trims to
 * the most recent ones and the API rejects anything longer — an unbounded
 * history is an unbounded bill and an unbounded prompt.
 */
export const CHECKIN_CHAT_MAX_TURNS = 20;

/** One-tap openers, so the patient never faces an empty box after checking in */
export const CHECKIN_CHAT_STARTERS = [
  "What's driving today's numbers?",
  "Why does my focus keep dipping?",
  "What should I try this week?",
] as const;

/** How many of the next free slots the post-check-in quick-book offers */
export const CHECKIN_QUICK_SLOT_COUNT = 3;

/** Booking preferred date string max length (YYYY-MM-DD format from date input) */
export const BOOKING_PREFERRED_DATE_MAX_LENGTH = 50;

/** Programme start date ISO string max length (YYYY-MM-DD = 10 chars) */
export const PROGRAMME_START_DATE_MAX_LENGTH = 10;

/** Booking request notes max length */
export const BOOKING_NOTES_MAX_LENGTH = 1_000;

/** Document title max length (shared between JSON and multipart upload routes) */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** MIME type string max length (e.g. "application/pdf") */
export const MIME_TYPE_MAX_LENGTH = 100;

/** Document upload max file size in MB (enforced server-side; shown in upload form label) */
export const DOCUMENT_MAX_FILE_SIZE_MB = 20;

/** Clinical goal title max length (Zod schema + form input) */
export const GOAL_TITLE_MAX_LENGTH = 300;

/** Clinical goal notes max length (Zod schema + form textarea) */
export const GOAL_NOTES_MAX_LENGTH = 2_000;

/** Days after which an assessment is considered stale and the patient is nudged to retake */
export const ASSESSMENT_STALE_DAYS = 30;

/** Goal progress % thresholds for dashboard milestone messaging */
export const GOAL_PROGRESS_COMPLETE_PCT = 100;
export const GOAL_PROGRESS_HIGH_PCT = 75;
export const GOAL_PROGRESS_LOW_PCT = 40;

/** Profile completeness % thresholds for intake bar messaging */
export const PROFILE_COMPLETENESS_LOW_PCT = 40;
export const PROFILE_COMPLETENESS_HIGH_PCT = 80;


/** Clinical goal row as returned by the goals API (dates are strings) */
export type GoalRow = {
  id: string;
  title: string;
  metric: string | null;
  baseline: number | null;
  target: number | null;
  current: number | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** How long (ms) to show the booking submission success banner before hiding it */
export const BOOKING_SUCCESS_MS = 5_000;

/** How often (ms) the message thread view polls for new messages while the tab is focused */
export const MESSAGE_POLL_INTERVAL_MS = 30_000;

/** Maximum badge count before showing "N+" truncation (e.g. 99+) */
export const BADGE_MAX_COUNT = 99;

/**
 * Check-in streak milestones that trigger a congratulatory email.
 * Fire on the exact day the streak is reached (insert only, not update).
 */
export const CHECKIN_STREAK_MILESTONES = [7, 30, 100] as const;

/** Days in one calendar week — base unit for the weekly digest date windows */
export const DAYS_PER_WEEK = 7;

/** How many days of check-in history to fetch for streak computation in the weekly digest */
export const WEEKLY_DIGEST_STREAK_WINDOW_DAYS = 90;

/**
 * Metric key used to link a clinical goal to the Inflection Edge assessment overall score.
 * SSOT — import this constant wherever goal metric comparisons or labels are needed.
 */
export const ASSESSMENT_GOAL_METRIC_KEY = "overallScore" as const;

/** Human-readable label for ASSESSMENT_GOAL_METRIC_KEY — SSOT for goal metric display */
export const ASSESSMENT_GOAL_METRIC_LABEL = "Assessment overall score" as const;

/**
 * Return a short note explaining how a linked metric auto-updates.
 * Returns null for unrecognised metric keys (no annotation shown).
 */
export function goalMetricAutoUpdateNote(metric: string | null | undefined): string | null {
  if (!metric) return null;
  if (metric === ASSESSMENT_GOAL_METRIC_KEY) return "auto-updates from your Inflection Edge assessments";
  if ((CHECKIN_METRICS as readonly { key: string }[]).some((m) => m.key === metric))
    return "auto-updates from your daily check-ins";
  return null;
}

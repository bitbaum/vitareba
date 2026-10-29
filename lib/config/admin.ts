// Admin signal thresholds — SSOT, no magic numbers in page files

import { CHECKIN_METRICS, type MetricKey } from "@/lib/config/portal";

/** Days since last check-in before patient is marked critical (has prior check-in history) */
export const NO_CHECKIN_CRITICAL_DAYS = 5;

/** Assessment score must drop by MORE THAN this many points to trigger critical signal (strict >, not >=) */
export const SCORE_DROP_CRITICAL = 10;

/** Days after registration where no activity is expected (new patient grace period) */
export const NEW_PATIENT_GRACE_DAYS = 3;

/** Days after an attended consultation before a follow-up booking is flagged as needed */
export const ATTENDED_FOLLOW_UP_DAYS = 30;

/** Days of check-in history to fetch for sparkline and signal computation */
export const SIGNAL_CHECKIN_WINDOW_DAYS = 7;

export const PATIENT_SIGNAL_VALUES = ["critical", "attention", "active", "new"] as const;
export type PatientSignal = (typeof PATIENT_SIGNAL_VALUES)[number];

/** Named constants for patient signal values — use in comparisons instead of string literals */
export const PATIENT_SIGNAL = {
  critical: "critical",
  attention: "attention",
  active: "active",
  new: "new",
} as const satisfies Record<PatientSignal, PatientSignal>;

/** Check-in metric keys that can be linked to clinical goals — derived from CHECKIN_METRICS SSOT */
export const CHECKIN_GOAL_METRICS = CHECKIN_METRICS.map((m) => m.key);
export type CheckinGoalMetric = MetricKey;

/** Sort order for signal severity — lower = shown first */
export const SIGNAL_SORT_ORDER: Record<PatientSignal, number> = {
  critical: 0,
  attention: 1,
  active: 2,
  new: 3,
};

export const SIGNAL_LABELS: Record<PatientSignal, string> = {
  critical: "Critical",
  attention: "Attention",
  active: "Active",
  new: "New",
};

/** Average check-in wellbeing score (mood+energy+sleep, 1–5) below which a dip is flagged */
export const CHECKIN_DIP_ALERT_THRESHOLD = 2.5;

/** Number of consecutive days at or below the threshold before Manuel is alerted */
export const CHECKIN_DIP_ALERT_DAYS = 3;

/** Wellness sparkline level thresholds (avg of 5 metrics, 1–5 scale) */
export const SPARKLINE_LOW_THRESHOLD = 2.5;
export const SPARKLINE_MID_THRESHOLD = 3.5;

/** A ChartKit bar tone: drawn in --ck-down / --ck-warning / --ck-up (globals.css). */
export type ChartTone = "positive" | "warning" | "negative";

/** Chart tone for each signal severity — SSOT for signal colour in charts. `new` has none: neutral ink. */
export const SIGNAL_TONES: Record<PatientSignal, ChartTone | undefined> = {
  critical: "negative",
  attention: "warning",
  active: "positive",
  new: undefined,
};

import { z } from "zod";
import {
  PROFILE_COMPLETION_FIELDS, PROFILE_FIELD_LABELS, PROFILE_COMPLETION_THRESHOLD, PROFILE_COMPLETION_LOWER_THRESHOLD,
  SLEEP_HOURS_MIN, SLEEP_HOURS_MAX, EXERCISE_FREQUENCY_VALUES,
  PATIENT_NOTE_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH, PROFILE_PHONE_MAX_LENGTH, PROFILE_DOB_MAX_LENGTH,
  PROFILE_CITY_MAX_LENGTH, PROFILE_OCCUPATION_MAX_LENGTH, PROFILE_REFERRAL_SOURCE_MAX_LENGTH,
} from "@/lib/config/portal";
import { BIOLOGICAL_SEX_VALUES } from "@/lib/config/measurements";

/** Validates an incoming profile PATCH body — all fields optional, none required. */
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(PROFILE_NAME_MAX_LENGTH).optional(),
  phone: z.string().max(PROFILE_PHONE_MAX_LENGTH).optional(),
  dateOfBirth: z.string().max(PROFILE_DOB_MAX_LENGTH).optional(),
  // Recorded only to pick the right reference interval for ferritin, testosterone,
  // haemoglobin and the rest — see lib/config/measurements.ts. Nullable because
  // declining to answer must stay possible, and the ranges then say so.
  biologicalSex: z.enum(BIOLOGICAL_SEX_VALUES).nullable().optional(),
  city: z.string().max(PROFILE_CITY_MAX_LENGTH).optional(),
  occupation: z.string().max(PROFILE_OCCUPATION_MAX_LENGTH).optional(),
  mainConcern: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  goals: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  diagnosisHistory: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  currentMedications: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  currentSupplements: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  sleepHoursAvg: z.number().int().min(SLEEP_HOURS_MIN).max(SLEEP_HOURS_MAX).nullable().optional(),
  exerciseFrequency: z.enum(EXERCISE_FREQUENCY_VALUES).nullable().optional(),
  referralSource: z.string().max(PROFILE_REFERRAL_SOURCE_MAX_LENGTH).optional(),
  notes: z.string().max(PATIENT_NOTE_MAX_LENGTH).optional(),
  digestOptOut: z.boolean().optional(),
  aiConsent: z.boolean().optional(),
  reminderOptOut: z.boolean().optional(),
});

/**
 * Returns the human-readable labels of profile fields that are not yet filled.
 * Used to surface actionable guidance in the dashboard completeness bar.
 */
export function getMissingProfileFields(
  profile: Record<string, unknown> | null | undefined
): string[] {
  if (!profile) return PROFILE_COMPLETION_FIELDS.map((f) => PROFILE_FIELD_LABELS[f]);
  return PROFILE_COMPLETION_FIELDS
    .filter((f) => profile[f] == null || profile[f] === "")
    .map((f) => PROFILE_FIELD_LABELS[f]);
}

/**
 * Returns a 0–100 integer representing how many of the 10 key clinical
 * profile fields are filled. Used for the patient dashboard bar and the
 * admin patient list column.
 */
export function computeProfileCompleteness(
  profile: Record<string, unknown> | null | undefined
): number {
  if (!profile) return 0;
  const filled = PROFILE_COMPLETION_FIELDS.filter(
    (f) => profile[f] != null && profile[f] !== ""
  ).length;
  return Math.round((filled / PROFILE_COMPLETION_FIELDS.length) * 100);
}

/**
 * Returns the CSS color variable for a given profile completeness percentage.
 * Thresholds sourced from SSOT constants — never hardcode 70/30 inline.
 */
export function profileCompletenessColor(pct: number): string {
  if (pct >= PROFILE_COMPLETION_THRESHOLD * 100) return "var(--teal)";
  if (pct >= PROFILE_COMPLETION_LOWER_THRESHOLD * 100) return "var(--warn)";
  return "var(--danger)";
}

/** Global CSS utility class for completeness colouring — use instead of style={{ color: profileCompletenessColor(n) }} */
export function profileCompletenessClass(pct: number): string {
  if (pct >= PROFILE_COMPLETION_THRESHOLD * 100) return "pct-good";
  if (pct >= PROFILE_COMPLETION_LOWER_THRESHOLD * 100) return "pct-warn";
  return "pct-bad";
}

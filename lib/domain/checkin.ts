import { z } from "zod";
import { formatDateISO } from "@/lib/utils/format";
import {
  CHECKIN_SCALE_MIN,
  CHECKIN_SCALE_MAX,
  CHECKIN_NOTES_MAX_LENGTH,
} from "@/lib/config/portal";

/** Single metric: integer on the 1–5 scale */
export const metricSchema = z.number().int().min(CHECKIN_SCALE_MIN).max(CHECKIN_SCALE_MAX);

/** Validates a complete daily check-in submission */
export const checkinSchema = z.object({
  // Must be a real YYYY-MM-DD that is not in the future. A future date would
  // silently break computeStreak() (which scans for "today" then breaks on the
  // first non-match), wiping the patient's real streak; the UI only ever sends
  // today, so rejecting future dates server-side costs nothing UX-wise.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => d <= new Date().toISOString().slice(0, 10), {
      message: "Check-in date cannot be in the future",
    }),
  sleep: metricSchema,
  energy: metricSchema,
  mood: metricSchema,
  focus: metricSchema,
  stress: metricSchema,
  notes: z.string().max(CHECKIN_NOTES_MAX_LENGTH).optional(),
});

/**
 * Normalize a raw 1–5 check-in metric value to the 0–100 integer scale used
 * for goal tracking and progress display.
 */
export function normalizeCheckinMetric(raw: number): number {
  return Math.round(((raw - CHECKIN_SCALE_MIN) / (CHECKIN_SCALE_MAX - CHECKIN_SCALE_MIN)) * 100);
}

/**
 * Returns a motivational message for the patient's current streak.
 * Milestones are domain decisions about what constitutes a significant
 * check-in cadence, not UI copy — they live here alongside computeStreak().
 */
export function streakMessage(streak: number): string {
  if (streak >= 100)
    return `${streak}-day streak — a dataset, not just a streak. Your programme can be tuned with precision most patients never reach.`;
  if (streak >= 30) return `${streak}-day streak — elite consistency. You're in rare company.`;
  if (streak >= 14)
    return `${streak}-day streak — two weeks of real data. Your trend is now meaningful.`;
  if (streak >= 7)
    return `${streak}-day streak — a full week. Your nervous system is being mapped.`;
  if (streak >= 3) return `${streak} days in a row. Patterns are already forming.`;
  if (streak === 2) return "2 days running. Keep it going.";
  if (streak === 1) return "Day 1 done. Come back tomorrow and you're on a streak.";
  return "First data point saved. Come back tomorrow to start your streak.";
}

/**
 * Compute the current consecutive daily check-in streak.
 * Streak counts backwards from today: if today is checked in → 1+,
 * if yesterday is also checked in → 2+, etc.
 * Gaps reset the streak to zero.
 *
 * @param checkins - Check-in records; only the `date` (YYYY-MM-DD) field is required.
 * @param now      - Injectable for tests; defaults to the current date.
 */
export function computeStreak(checkins: { date: string }[], now: Date = new Date()): number {
  if (checkins.length === 0) return 0;

  const today = formatDateISO(now);
  // Drop any future-dated records before sorting — defensive against legacy
  // rows that bypassed the (newer) schema-level future-date guard. Without
  // this, a single future record would short-circuit the loop and report 0.
  const sorted = [...checkins]
    .filter((c) => c.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  let expected = today;

  for (const c of sorted) {
    if (c.date === expected) {
      streak++;
      // Use UTC midnight to avoid DST / timezone crossing when stepping back one day
      const prev = new Date(expected + "T00:00:00.000Z");
      prev.setUTCDate(prev.getUTCDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Reading a measured number: is it inside its interval, which way is it moving,
 * and does anyone need to act today.
 *
 * Pure functions only — no database, no HTTP, no rendering. Everything a
 * clinician sees about a value is decided here and tested in measurements.test.ts,
 * because the alternative is the same judgement re-implemented slightly
 * differently in the patient view, the admin view and the alerting cron.
 *
 * Nothing here diagnoses. It compares a number to a published interval and
 * describes the comparison. That distinction is the whole reason the vocabulary
 * below says "outside the reference interval" and never "abnormal".
 */

import { z } from "zod";
import {
  MEASUREMENT_MIN_TREND_POINTS,
  MEASUREMENT_NOTE_MAX,
  MEASUREMENT_VALUE_MAX,
  MEASUREMENT_VALUE_MIN,
  isMeasurementKey,
  isMeasurementSource,
  measurementDef,
  type BiologicalSex,
  type MeasurementDef,
  type MeasurementRange,
} from "@/lib/config/measurements";

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * How far ahead of the server's clock a measurement date may sit.
 *
 * Not zero, and deliberately generous: the browser sends the patient's clock,
 * timezones put a legitimate "this morning" ahead of UTC, and a device clock
 * drifts. A strict "not in the future" rule rejects real readings from real
 * people — this project has already lost bookings to exactly that. The rule
 * that matters is catching a typed year of 2062, not policing minutes.
 */
const FUTURE_GRACE_MS = 36 * 60 * 60 * 1000;
/** Nothing measured before this is a clinical record; it is a typo. */
const EARLIEST_MEASUREMENT = new Date("1900-01-01T00:00:00Z");

/** Most values one laboratory report can carry in a single submission. */
export const MEASUREMENT_BATCH_MAX = 60;

export const measurementValueSchema = z
  .number()
  .finite()
  .min(MEASUREMENT_VALUE_MIN)
  .max(MEASUREMENT_VALUE_MAX);

export const measurementEntrySchema = z.object({
  // Validated against the config, which is the only truth about what may be
  // stored — `kind` is a varchar in Postgres precisely so this check, not a
  // migration, is what governs the set of markers.
  kind: z.string().refine(isMeasurementKey, { message: "Unknown measurement" }),
  value: measurementValueSchema,
  note: z.string().max(MEASUREMENT_NOTE_MAX).optional(),
});

export const measurementSubmissionSchema = z.object({
  // The date on the report, not the date of typing. Accepts "2026-03-14" and a
  // full ISO timestamp alike, because a lab prints one and a device sends the other.
  measuredAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + FUTURE_GRACE_MS, {
      message: "Measurement date is in the future",
    })
    .refine((d) => d >= EARLIEST_MEASUREMENT, { message: "Measurement date is not plausible" }),
  source: z.string().refine(isMeasurementSource, { message: "Unknown source" }),
  entries: z.array(measurementEntrySchema).min(1).max(MEASUREMENT_BATCH_MAX),
});

export type MeasurementSubmission = z.infer<typeof measurementSubmissionSchema>;

// ─── Reference interval resolution ────────────────────────────────────────────

export type ResolvedRange = {
  range?: MeasurementRange;
  /** True when the interval was chosen for this patient's recorded sex. */
  sexSpecific: boolean;
};

/**
 * The interval to compare against, given what we know about the patient.
 *
 * When sex is unknown we deliberately fall back to `ref` rather than picking
 * one — a ferritin of 20 µg/L is unremarkable against the male interval and
 * worth a conversation against the female one, and guessing wrong in either
 * direction is a clinical error the patient never sees us make. `sexSpecific`
 * lets the UI say which happened.
 */
export function resolveRange(def: MeasurementDef, sex?: BiologicalSex | null): ResolvedRange {
  if (sex === "female" && def.refFemale) return { range: def.refFemale, sexSpecific: true };
  if (sex === "male" && def.refMale) return { range: def.refMale, sexSpecific: true };
  return { range: def.ref, sexSpecific: false };
}

/** True when this marker's interval would change if we knew the patient's sex. */
export function hasSexSpecificRange(def: MeasurementDef): boolean {
  return Boolean(def.refFemale || def.refMale);
}

// ─── Position against an interval ─────────────────────────────────────────────

export const MEASUREMENT_STATUS = {
  /** Below the reference interval's lower bound. */
  below: "below",
  /** Inside the reference interval. */
  within: "within",
  /** Above the reference interval's upper bound. */
  above: "above",
  /** No published interval for this marker — the trend is the only story. */
  unrated: "unrated",
} as const;

export type MeasurementStatus = (typeof MEASUREMENT_STATUS)[keyof typeof MEASUREMENT_STATUS];

function isBelow(value: number, range?: MeasurementRange): boolean {
  return range?.low !== undefined && value < range.low;
}

function isAbove(value: number, range?: MeasurementRange): boolean {
  return range?.high !== undefined && value > range.high;
}

function isOutside(value: number, range?: MeasurementRange): boolean {
  return isBelow(value, range) || isAbove(value, range);
}

export type MeasurementReading = {
  status: MeasurementStatus;
  /** True when the value sits outside the reference interval in either direction. */
  outsideRef: boolean;
  /**
   * Inside the narrower, guideline-backed target — or null when the marker has
   * no such target. Kept apart from `status` so the UI can never present a
   * missed target as an out-of-range result.
   */
  atOptimal: boolean | null;
  /** True when a recognised action threshold has been crossed. */
  needsAttention: boolean;
  range?: MeasurementRange;
  sexSpecific: boolean;
};

/**
 * Where one value sits. `needsAttention` is deliberately a separate, much rarer
 * signal than `outsideRef`: most out-of-interval values are ordinary clinical
 * findings for the next appointment, and colouring them all as urgent trains
 * everyone to ignore the colour.
 */
export function readMeasurement(
  kind: string,
  value: number,
  sex?: BiologicalSex | null,
): MeasurementReading {
  const def = measurementDef(kind);
  if (!def) {
    return {
      status: "unrated",
      outsideRef: false,
      atOptimal: null,
      needsAttention: false,
      sexSpecific: false,
    };
  }

  const { range, sexSpecific } = resolveRange(def, sex);
  const needsAttention = def.alert ? isOutside(value, def.alert) : false;
  const atOptimal = def.optimal ? !isOutside(value, def.optimal) : null;
  const common = { atOptimal, needsAttention, sexSpecific };

  if (!range) return { ...common, status: "unrated", outsideRef: false };
  if (isBelow(value, range)) return { ...common, status: "below", outsideRef: true, range };
  if (isAbove(value, range)) return { ...common, status: "above", outsideRef: true, range };
  return { ...common, status: "within", outsideRef: false, range };
}

// ─── Trend ────────────────────────────────────────────────────────────────────

export type MeasurementPoint = {
  value: number;
  measuredAt: Date;
};

export const TREND_VERDICT = {
  improving: "improving",
  worsening: "worsening",
  steady: "steady",
  /** Moved, but the marker has no clinical direction (weight, height, HRV). */
  changed: "changed",
  /** Not enough history to say anything. */
  unknown: "unknown",
} as const;

export type TrendVerdict = (typeof TREND_VERDICT)[keyof typeof TREND_VERDICT];

export type MeasurementTrend = {
  verdict: TrendVerdict;
  /** Signed change from the earliest to the latest point in the window. */
  delta: number;
  /** Percent change relative to the earliest point; null when that point is 0. */
  percent: number | null;
  latest?: MeasurementPoint;
  previous?: MeasurementPoint;
  points: number;
};

/**
 * Movement that is smaller than this share of the reference interval's width is
 * called steady. Every measurement carries assay and biological noise, and a
 * 0.3% wobble rendered as an improving arrow is a lie told with a straight face.
 */
const STEADY_FRACTION_OF_RANGE = 0.05;
/** Fallback when a marker has no bounded interval to take a fraction of. */
const STEADY_FRACTION_OF_VALUE = 0.02;

function steadyThreshold(def: MeasurementDef, range: MeasurementRange | undefined, from: number) {
  if (range?.low !== undefined && range?.high !== undefined) {
    return (range.high - range.low) * STEADY_FRACTION_OF_RANGE;
  }
  return Math.abs(from) * STEADY_FRACTION_OF_VALUE;
}

/**
 * Reads a series oldest-first and says which way it went.
 *
 * For a "within" marker, better means closer to the interval — a TSH falling
 * from 8 to 5 is an improvement while one falling from 2 to 0.2 is not, and a
 * naive "down is good" rule gets the second one exactly backwards.
 */
export function computeTrend(
  kind: string,
  points: readonly MeasurementPoint[],
  sex?: BiologicalSex | null,
): MeasurementTrend {
  const sorted = [...points].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  const base = { latest, previous, points: sorted.length };

  if (sorted.length < MEASUREMENT_MIN_TREND_POINTS) {
    return { ...base, verdict: "unknown", delta: 0, percent: null };
  }

  const from = sorted[0].value;
  const to = latest.value;
  const delta = to - from;
  const percent = from === 0 ? null : (delta / Math.abs(from)) * 100;

  const def = measurementDef(kind);
  if (!def) return { ...base, verdict: "changed", delta, percent };

  const { range } = resolveRange(def, sex);
  if (Math.abs(delta) < steadyThreshold(def, range, from)) {
    return { ...base, verdict: "steady", delta, percent };
  }

  if (def.direction === "neutral") return { ...base, verdict: "changed", delta, percent };
  if (def.direction === "lower") {
    return { ...base, verdict: delta < 0 ? "improving" : "worsening", delta, percent };
  }
  if (def.direction === "higher") {
    return { ...base, verdict: delta > 0 ? "improving" : "worsening", delta, percent };
  }

  // "within": judge by distance from the interval, not by sign.
  const before = distanceOutside(from, range);
  const after = distanceOutside(to, range);
  if (after < before) return { ...base, verdict: "improving", delta, percent };
  if (after > before) return { ...base, verdict: "worsening", delta, percent };
  return { ...base, verdict: "steady", delta, percent };
}

/** How far outside the interval a value sits. 0 when inside or unbounded. */
export function distanceOutside(value: number, range?: MeasurementRange): number {
  if (!range) return 0;
  if (range.low !== undefined && value < range.low) return range.low - value;
  if (range.high !== undefined && value > range.high) return value - range.high;
  return 0;
}

// ─── Derived values ───────────────────────────────────────────────────────────

/**
 * Derived numbers are COMPUTED, never stored. Storing BMI next to weight and
 * height creates a second truth that goes stale the moment one of them changes,
 * and a stale BMI is worse than no BMI.
 */

export function bmi(weightKg: number, heightCm: number): number | null {
  if (heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/**
 * HOMA-IR — insulin resistance from a fasting pair. (glucose × insulin) / 22.5
 * with glucose in mmol/L and insulin in mIU/L, which is what this platform
 * stores. Feed it mg/dL and the answer is wrong by a factor of 18, which is why
 * the units live in the config and never in a form field.
 */
export function homaIr(glucoseMmolL: number, insulinMiuL: number): number | null {
  if (glucoseMmolL <= 0 || insulinMiuL <= 0) return null;
  return round((glucoseMmolL * insulinMiuL) / 22.5, 2);
}

/** Non-HDL cholesterol — everything atherogenic in one number. */
export function nonHdl(totalCholesterol: number, hdl: number): number | null {
  if (totalCholesterol <= 0 || hdl < 0 || hdl > totalCholesterol) return null;
  return round(totalCholesterol - hdl, 2);
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Value at the marker's declared precision, without its unit. */
export function formatValue(kind: string, value: number): string {
  const def = measurementDef(kind);
  return value.toFixed(def?.decimals ?? 1);
}

/** Value with its unit, e.g. "5.4 mmol/L". */
export function formatWithUnit(kind: string, value: number): string {
  const def = measurementDef(kind);
  if (!def) return String(value);
  return `${formatValue(kind, value)} ${def.unit}`;
}

/**
 * An interval as a clinician reads it: "3.9–5.5", "< 1.7", "≥ 90".
 * Returns null when the marker has no interval, so callers render nothing
 * rather than an empty dash that looks like a missing value.
 */
export function formatRange(kind: string, range?: MeasurementRange): string | null {
  if (!range) return null;
  const fmt = (n: number) => formatValue(kind, n);
  if (range.low !== undefined && range.high !== undefined) {
    return `${fmt(range.low)}–${fmt(range.high)}`;
  }
  if (range.high !== undefined) return `< ${fmt(range.high)}`;
  if (range.low !== undefined) return `≥ ${fmt(range.low)}`;
  return null;
}

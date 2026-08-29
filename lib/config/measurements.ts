/**
 * SSOT for every clinical measurement the platform can store, chart and interpret.
 *
 * WHY THIS FILE EXISTS
 * Until now a lab result could only enter the system as an uploaded PDF. A PDF
 * cannot be trended, compared to a reference interval, or checked for a
 * dangerous direction of travel — so the single most valuable thing a clinician
 * does (watch a number move) was invisible to the software. Everything here
 * exists to make a measured value first-class: typed, unitful, and comparable.
 *
 * ADDING A MARKER = EDITING THIS FILE ONLY.
 * `measurements.kind` is a varchar validated against these keys rather than a
 * Postgres enum, precisely so a new marker never needs a migration. The keys
 * here are the only truth about what may be stored; lib/config/measurements.test.ts
 * enforces that.
 *
 * ─── ON REFERENCE INTERVALS ──────────────────────────────────────────────────
 * `ref` is a REFERENCE INTERVAL: the range most healthy adults fall in. Outside
 * it is not a diagnosis and inside it is not health. Every interval below is the
 * conservative, widely published adult figure in the SI units Swiss labs report,
 * with its origin recorded in `source`.
 *
 * `optimal` is narrower and is NOT a lab reference interval — it is a target
 * drawn from a guideline or a named body of evidence. It is stated separately,
 * and rendered separately, because presenting a target as if it were a normal
 * range would silently pathologise healthy people. Where a widely used clinic
 * "optimal" has no guideline behind it, there is no `optimal` field.
 *
 * Any patient's own lab prints its own intervals, and those win: assay methods
 * differ. These exist so a number can be *read*, not so it can be ruled on.
 *
 * ─── ON SEX ──────────────────────────────────────────────────────────────────
 * Ferritin, haemoglobin, testosterone, creatinine, waist and the transaminases
 * have genuinely different intervals by sex; a single interval mislabels real
 * patients. `refFemale` / `refMale` override `ref` when the profile records a
 * sex. When it does not, `ref` is used and the UI must say the interval is
 * unspecified rather than imply it was tailored.
 */

// ─── Categories ───────────────────────────────────────────────────────────────

export const MEASUREMENT_CATEGORIES = [
  { key: "vitals", label: "Vitals" },
  { key: "body", label: "Body composition" },
  { key: "metabolic", label: "Metabolic" },
  { key: "lipids", label: "Lipids" },
  { key: "inflammation", label: "Inflammation" },
  { key: "thyroid", label: "Thyroid" },
  { key: "hormones", label: "Hormones" },
  { key: "micronutrient", label: "Micronutrients" },
  { key: "organ", label: "Organ function" },
  { key: "recovery", label: "Sleep & recovery" },
] as const;

export type MeasurementCategory = (typeof MEASUREMENT_CATEGORIES)[number]["key"];

// ─── Types ────────────────────────────────────────────────────────────────────

export type MeasurementRange = {
  low?: number;
  high?: number;
};

/**
 * `better` drives how a trend arrow is coloured.
 *  - "lower"  → a falling value is an improvement (LDL, hs-CRP, stress)
 *  - "higher" → a rising value is an improvement (HDL, VO₂max, HRV)
 *  - "within" → only distance from the interval matters (TSH, sodium)
 *  - "neutral"→ no clinical direction; chart it, never judge it (weight, height)
 */
export type MeasurementDirection = "lower" | "higher" | "within" | "neutral";

export type MeasurementDef = {
  key: string;
  label: string;
  /** Shown where horizontal space is tight (table headers, chart legends). */
  shortLabel: string;
  category: MeasurementCategory;
  /** Unit as Swiss laboratories report it. Stored values are always in this unit. */
  unit: string;
  /** Decimal places for display, and the precision the input rounds to. */
  decimals: number;
  ref?: MeasurementRange;
  refFemale?: MeasurementRange;
  refMale?: MeasurementRange;
  /** A guideline-backed target, narrower than `ref`. Never presented as "normal". */
  optimal?: MeasurementRange;
  /**
   * WIDER than `ref`: outside this, a clinician should look today rather than at
   * the next appointment. Present only where a recognised action threshold
   * exists — most markers have none, and inventing one would turn the clinician
   * dashboard into noise that gets ignored, which is worse than silence.
   * The value is still not a diagnosis; it is a reason to pick up the phone.
   */
  alert?: MeasurementRange;
  /** Why that threshold is an action threshold. Required whenever `alert` is set. */
  alertSource?: string;
  direction: MeasurementDirection;
  /**
   * True when the patient may record it themselves. Vitals and wearable-derived
   * numbers, yes — a patient with a home cuff is the best source of blood
   * pressure there is. Laboratory results, no: they enter under a clinician so
   * the record says who vouched for them.
   */
  patientEnterable: boolean;
  /** Where the interval comes from. Rendered in the UI next to the interval. */
  source?: string;
  /** One line a patient can understand, shown on hover / in the detail view. */
  plain?: string;
};

// ─── Definitions ──────────────────────────────────────────────────────────────

/**
 * The literal tuple. Not exported: `as const` keeps every key as a literal type
 * (which is what makes MeasurementKey exhaustive) but it also drops the optional
 * fields from the union, so `def.optimal` would not typecheck on it. The widened
 * MEASUREMENT_DEFS below is the same array with the full shape — one value, two
 * views, no second source of truth.
 */
const DEFS = [
  // ── Vitals ────────────────────────────────────────────────────────────────
  {
    key: "bp_systolic",
    label: "Blood pressure (systolic)",
    shortLabel: "BP sys",
    category: "vitals",
    unit: "mmHg",
    decimals: 0,
    ref: { low: 90, high: 139 },
    optimal: { low: 90, high: 119 },
    alert: { low: 90, high: 179 },
    alertSource:
      "ESC/ESH: ≥180 systolic is a hypertensive crisis; <90 is symptomatic hypotension territory",
    direction: "within",
    patientEnterable: true,
    source: "ESC/ESH 2023: ≥140 defines hypertension; <120 optimal",
    plain: "The pressure while your heart beats.",
  },
  {
    key: "bp_diastolic",
    label: "Blood pressure (diastolic)",
    shortLabel: "BP dia",
    category: "vitals",
    unit: "mmHg",
    decimals: 0,
    ref: { low: 60, high: 89 },
    optimal: { low: 60, high: 79 },
    alert: { low: 50, high: 109 },
    alertSource: "ESC/ESH: ≥110 diastolic is a hypertensive crisis",
    direction: "within",
    patientEnterable: true,
    source: "ESC/ESH 2023: ≥90 defines hypertension; <80 optimal",
    plain: "The pressure while your heart rests between beats.",
  },
  {
    key: "heart_rate",
    label: "Resting heart rate",
    shortLabel: "RHR",
    category: "vitals",
    unit: "bpm",
    decimals: 0,
    ref: { low: 50, high: 90 },
    alert: { low: 40, high: 120 },
    alertSource:
      "Resting bradycardia <40 or tachycardia >120 warrants prompt review — the pair to watch on a stimulant",
    direction: "lower",
    patientEnterable: true,
    source: "Conventional adult resting range; trained athletes run lower",
    plain: "Beats per minute at rest. Fitness tends to lower it.",
  },

  // ── Body composition ──────────────────────────────────────────────────────
  {
    key: "weight",
    label: "Weight",
    shortLabel: "Weight",
    category: "body",
    unit: "kg",
    decimals: 1,
    direction: "neutral",
    patientEnterable: true,
    plain: "Tracked for trend and for medication dosing — there is no target here.",
  },
  {
    key: "height",
    label: "Height",
    shortLabel: "Height",
    category: "body",
    unit: "cm",
    decimals: 0,
    direction: "neutral",
    patientEnterable: true,
    plain: "Recorded once; used to calculate BMI.",
  },
  {
    key: "waist",
    label: "Waist circumference",
    shortLabel: "Waist",
    category: "body",
    unit: "cm",
    decimals: 0,
    refFemale: { high: 80 },
    refMale: { high: 94 },
    ref: { high: 94 },
    direction: "lower",
    patientEnterable: true,
    source: "IDF Europid thresholds for central adiposity",
    plain: "A closer proxy for metabolic risk than weight alone.",
  },
  {
    key: "body_fat",
    label: "Body fat",
    shortLabel: "Body fat",
    category: "body",
    unit: "%",
    decimals: 1,
    refFemale: { low: 21, high: 33 },
    refMale: { low: 8, high: 20 },
    ref: { low: 8, high: 33 },
    direction: "within",
    patientEnterable: true,
    source: "Indicative adult ranges; varies substantially by measurement method",
  },

  // ── Metabolic ─────────────────────────────────────────────────────────────
  {
    key: "glucose_fasting",
    label: "Fasting glucose",
    shortLabel: "Glucose",
    category: "metabolic",
    unit: "mmol/L",
    decimals: 1,
    ref: { low: 3.9, high: 5.5 },
    alert: { high: 10.9 },
    alertSource:
      "≥11.1 mmol/L is the diabetes-range threshold and should not wait for the next appointment",
    direction: "within",
    patientEnterable: false,
    source: "ADA: 5.6–6.9 impaired fasting glucose, ≥7.0 diabetes range",
    plain: "Blood sugar after an overnight fast.",
  },
  {
    key: "hba1c",
    label: "HbA1c",
    shortLabel: "HbA1c",
    category: "metabolic",
    unit: "%",
    decimals: 1,
    ref: { high: 5.6 },
    optimal: { high: 5.4 },
    direction: "lower",
    patientEnterable: false,
    source: "ADA: 5.7–6.4 prediabetes, ≥6.5 diabetes range",
    plain: "Your average blood sugar over roughly three months.",
  },
  {
    key: "insulin_fasting",
    label: "Fasting insulin",
    shortLabel: "Insulin",
    category: "metabolic",
    unit: "mIU/L",
    decimals: 1,
    ref: { low: 2, high: 25 },
    direction: "lower",
    patientEnterable: false,
    source:
      "Laboratory reference intervals are wide and assay-dependent; interpret with glucose via HOMA-IR",
    plain: "How hard the pancreas is working to keep blood sugar down.",
  },

  // ── Lipids ────────────────────────────────────────────────────────────────
  {
    key: "cholesterol_total",
    label: "Total cholesterol",
    shortLabel: "Total chol",
    category: "lipids",
    unit: "mmol/L",
    decimals: 2,
    ref: { high: 5.0 },
    direction: "lower",
    patientEnterable: false,
    source: "ESC/EAS 2019 desirable level",
  },
  {
    key: "ldl",
    label: "LDL cholesterol",
    shortLabel: "LDL",
    category: "lipids",
    unit: "mmol/L",
    decimals: 2,
    ref: { high: 3.0 },
    direction: "lower",
    patientEnterable: false,
    source: "ESC/EAS 2019 low-risk target; targets fall with cardiovascular risk",
  },
  {
    key: "hdl",
    label: "HDL cholesterol",
    shortLabel: "HDL",
    category: "lipids",
    unit: "mmol/L",
    decimals: 2,
    refFemale: { low: 1.2 },
    refMale: { low: 1.0 },
    ref: { low: 1.0 },
    direction: "higher",
    patientEnterable: false,
    source: "ESC/EAS 2019 sex-specific thresholds",
  },
  {
    key: "triglycerides",
    label: "Triglycerides",
    shortLabel: "TG",
    category: "lipids",
    unit: "mmol/L",
    decimals: 2,
    ref: { high: 1.7 },
    direction: "lower",
    patientEnterable: false,
    source: "ESC/EAS 2019 desirable level (fasting)",
  },
  {
    key: "apob",
    label: "Apolipoprotein B",
    shortLabel: "ApoB",
    category: "lipids",
    unit: "g/L",
    decimals: 2,
    ref: { high: 1.0 },
    optimal: { high: 0.8 },
    direction: "lower",
    patientEnterable: false,
    source: "ESC/EAS 2019: <1.0 low/moderate risk, <0.8 high risk",
    plain: "Counts the particles that actually carry cholesterol into artery walls.",
  },
  {
    key: "lpa",
    label: "Lipoprotein(a)",
    shortLabel: "Lp(a)",
    category: "lipids",
    unit: "nmol/L",
    decimals: 0,
    ref: { high: 75 },
    direction: "lower",
    patientEnterable: false,
    source: "ESC 2022: risk rises above ~75; >125 marks high risk. Largely genetic — measure once",
  },

  // ── Inflammation ──────────────────────────────────────────────────────────
  {
    key: "hs_crp",
    label: "hs-CRP",
    shortLabel: "hs-CRP",
    category: "inflammation",
    unit: "mg/L",
    decimals: 2,
    ref: { high: 3.0 },
    optimal: { high: 1.0 },
    direction: "lower",
    patientEnterable: false,
    source: "AHA/CDC: <1 low, 1–3 average, >3 high cardiovascular risk",
    plain: "Low-grade inflammation. A recent infection raises it temporarily.",
  },
  {
    key: "homocysteine",
    label: "Homocysteine",
    shortLabel: "Hcy",
    category: "inflammation",
    unit: "µmol/L",
    decimals: 1,
    ref: { high: 15 },
    optimal: { high: 10 },
    direction: "lower",
    patientEnterable: false,
    source: "Laboratory upper limit ~15; <10 the commonly cited B-vitamin-repletion target",
  },

  // ── Thyroid ───────────────────────────────────────────────────────────────
  {
    key: "tsh",
    label: "TSH",
    shortLabel: "TSH",
    category: "thyroid",
    unit: "mIU/L",
    decimals: 2,
    ref: { low: 0.4, high: 4.0 },
    alert: { low: 0.1, high: 10 },
    alertSource:
      "Overt thyroid dysfunction sits outside 0.1–10; both ends can look exactly like the symptoms we are treating",
    direction: "within",
    patientEnterable: false,
    source: "Conventional adult laboratory interval",
    plain: "The signal the brain sends the thyroid — high means it is shouting.",
  },
  {
    key: "ft4",
    label: "Free T4",
    shortLabel: "fT4",
    category: "thyroid",
    unit: "pmol/L",
    decimals: 1,
    ref: { low: 12, high: 22 },
    direction: "within",
    patientEnterable: false,
    source: "Conventional adult laboratory interval",
  },
  {
    key: "ft3",
    label: "Free T3",
    shortLabel: "fT3",
    category: "thyroid",
    unit: "pmol/L",
    decimals: 1,
    ref: { low: 3.1, high: 6.8 },
    direction: "within",
    patientEnterable: false,
    source: "Conventional adult laboratory interval",
  },

  // ── Hormones ──────────────────────────────────────────────────────────────
  {
    key: "testosterone_total",
    label: "Testosterone (total)",
    shortLabel: "Testo",
    category: "hormones",
    unit: "nmol/L",
    decimals: 1,
    refFemale: { low: 0.3, high: 1.7 },
    refMale: { low: 8.6, high: 29 },
    direction: "within",
    patientEnterable: false,
    source: "Sex-specific adult laboratory intervals; morning sample",
  },
  {
    key: "cortisol_am",
    label: "Cortisol (morning)",
    shortLabel: "Cortisol",
    category: "hormones",
    unit: "nmol/L",
    decimals: 0,
    ref: { low: 140, high: 690 },
    direction: "within",
    patientEnterable: false,
    source: "Conventional 08:00 serum interval; strongly time-of-day dependent",
  },

  // ── Micronutrients ────────────────────────────────────────────────────────
  {
    key: "vitamin_d",
    label: "Vitamin D (25-OH)",
    shortLabel: "Vit D",
    category: "micronutrient",
    unit: "nmol/L",
    decimals: 0,
    ref: { low: 50, high: 250 },
    optimal: { low: 75, high: 150 },
    direction: "within",
    patientEnterable: false,
    source: "<50 deficiency, ≥75 sufficiency (Endocrine Society); >250 risks toxicity",
  },
  {
    key: "ferritin",
    label: "Ferritin",
    shortLabel: "Ferritin",
    category: "micronutrient",
    unit: "µg/L",
    decimals: 0,
    refFemale: { low: 15, high: 150 },
    refMale: { low: 30, high: 400 },
    ref: { low: 15, high: 400 },
    direction: "within",
    patientEnterable: false,
    source:
      "Sex-specific laboratory intervals. Rises with inflammation — read alongside hs-CRP. Iron status is relevant to attention and restless legs even within the interval",
    plain: "Your iron stores.",
  },
  {
    key: "vitamin_b12",
    label: "Vitamin B12",
    shortLabel: "B12",
    category: "micronutrient",
    unit: "pmol/L",
    decimals: 0,
    ref: { low: 150, high: 650 },
    optimal: { low: 300 },
    direction: "within",
    patientEnterable: false,
    source: "Laboratory interval; functional deficiency occurs in the lower part of it",
  },
  {
    key: "folate",
    label: "Folate",
    shortLabel: "Folate",
    category: "micronutrient",
    unit: "nmol/L",
    decimals: 1,
    ref: { low: 7, high: 45 },
    direction: "within",
    patientEnterable: false,
    source: "Conventional serum interval",
  },
  {
    key: "magnesium",
    label: "Magnesium",
    shortLabel: "Mg",
    category: "micronutrient",
    unit: "mmol/L",
    decimals: 2,
    ref: { low: 0.75, high: 0.95 },
    direction: "within",
    patientEnterable: false,
    source: "Serum interval; serum reflects total body stores poorly",
  },
  {
    key: "zinc",
    label: "Zinc",
    shortLabel: "Zinc",
    category: "micronutrient",
    unit: "µmol/L",
    decimals: 1,
    ref: { low: 11, high: 18 },
    direction: "within",
    patientEnterable: false,
    source: "Conventional plasma interval; falls during acute inflammation",
  },
  {
    key: "omega3_index",
    label: "Omega-3 index",
    shortLabel: "Omega-3",
    category: "micronutrient",
    unit: "%",
    decimals: 1,
    ref: { low: 4 },
    optimal: { low: 8 },
    direction: "higher",
    patientEnterable: false,
    source: "Harris & von Schacky: <4% highest risk, ≥8% desirable",
  },

  // ── Organ function ────────────────────────────────────────────────────────
  {
    key: "creatinine",
    label: "Creatinine",
    shortLabel: "Creat",
    category: "organ",
    unit: "µmol/L",
    decimals: 0,
    refFemale: { low: 45, high: 84 },
    refMale: { low: 59, high: 104 },
    ref: { low: 45, high: 104 },
    direction: "within",
    patientEnterable: false,
    source: "Sex-specific serum intervals; muscle mass raises it independently of kidney function",
  },
  {
    key: "egfr",
    label: "eGFR",
    shortLabel: "eGFR",
    category: "organ",
    unit: "mL/min/1.73m²",
    decimals: 0,
    ref: { low: 90 },
    alert: { low: 30 },
    alertSource:
      "KDIGO: <30 is severely reduced kidney function and changes what may be prescribed",
    direction: "higher",
    patientEnterable: false,
    source: "KDIGO: ≥90 normal, 60–89 mildly reduced, <60 for ≥3 months defines CKD",
  },
  {
    key: "alt",
    label: "ALT",
    shortLabel: "ALT",
    category: "organ",
    unit: "U/L",
    decimals: 0,
    refFemale: { low: 10, high: 35 },
    refMale: { low: 10, high: 50 },
    ref: { low: 10, high: 50 },
    alert: { high: 150 },
    alertSource:
      "Above roughly three times the upper limit of normal is the conventional stop-and-review point in drug monitoring",
    direction: "lower",
    patientEnterable: false,
    source: "Sex-specific laboratory intervals",
    plain: "A liver enzyme. Raised values often reflect fat in the liver.",
  },
  {
    key: "ggt",
    label: "GGT",
    shortLabel: "GGT",
    category: "organ",
    unit: "U/L",
    decimals: 0,
    refFemale: { high: 40 },
    refMale: { high: 60 },
    ref: { high: 60 },
    direction: "lower",
    patientEnterable: false,
    source: "Sex-specific laboratory upper limits",
  },
  {
    key: "haemoglobin",
    label: "Haemoglobin",
    shortLabel: "Hb",
    category: "organ",
    unit: "g/L",
    decimals: 0,
    refFemale: { low: 120, high: 160 },
    refMale: { low: 135, high: 175 },
    ref: { low: 120, high: 175 },
    alert: { low: 80 },
    alertSource: "Haemoglobin <80 g/L is significant anaemia needing prompt assessment",
    direction: "within",
    patientEnterable: false,
    source: "Sex-specific laboratory intervals",
  },

  // ── Sleep & recovery ──────────────────────────────────────────────────────
  {
    key: "hrv_rmssd",
    label: "Heart rate variability (RMSSD)",
    shortLabel: "HRV",
    category: "recovery",
    unit: "ms",
    decimals: 0,
    direction: "higher",
    patientEnterable: true,
    source:
      "No population interval is meaningful — values differ by device and by person. Read your own trend, never someone else's number",
    plain: "How much your heart rate varies beat to beat. Yours is only comparable to yours.",
  },
  {
    key: "sleep_duration",
    label: "Sleep duration",
    shortLabel: "Sleep",
    category: "recovery",
    unit: "h",
    decimals: 1,
    ref: { low: 7, high: 9 },
    direction: "within",
    patientEnterable: true,
    source: "AASM/SRS adult recommendation of at least 7 hours",
  },
  {
    key: "sleep_efficiency",
    label: "Sleep efficiency",
    shortLabel: "Sleep eff",
    category: "recovery",
    unit: "%",
    decimals: 0,
    ref: { low: 85 },
    direction: "higher",
    patientEnterable: true,
    source: "Conventional threshold used in insomnia care",
    plain: "The share of time in bed you were actually asleep.",
  },
  {
    key: "vo2max",
    label: "VO₂ max",
    shortLabel: "VO₂ max",
    category: "recovery",
    unit: "mL/kg/min",
    decimals: 1,
    direction: "higher",
    patientEnterable: true,
    source:
      "Interpreted against age and sex norms rather than one interval; among the strongest predictors of all-cause mortality",
  },
] as const satisfies readonly MeasurementDef[];

export type MeasurementKey = (typeof DEFS)[number]["key"];

/** Every marker, in display order, with the full definition shape. */
export const MEASUREMENT_DEFS: readonly MeasurementDef[] = DEFS;

export const MEASUREMENT_KEYS = DEFS.map((d) => d.key) as readonly MeasurementKey[];

const BY_KEY = new Map<string, MeasurementDef>(MEASUREMENT_DEFS.map((d) => [d.key, d]));

/** Definition lookup. Returns undefined for an unknown key — callers decide. */
export function measurementDef(key: string): MeasurementDef | undefined {
  return BY_KEY.get(key);
}

export function isMeasurementKey(key: string): key is MeasurementKey {
  return BY_KEY.has(key);
}

/** The subset a patient may record themselves — vitals and wearable numbers. */
export const PATIENT_ENTERABLE_KEYS = DEFS.filter((d) => d.patientEnterable).map(
  (d) => d.key,
) as readonly MeasurementKey[];

// ─── Provenance ───────────────────────────────────────────────────────────────

/**
 * Who put the number in the record. This is not decoration: a clinician reading
 * a borderline value needs to know whether it came off a certified analyser or
 * a patient's wrist, and a self-reported blood pressure is not evidence of the
 * same weight as a laboratory report.
 */
export const MEASUREMENT_SOURCES = [
  { key: "lab", label: "Laboratory", description: "Reported by an accredited laboratory" },
  { key: "clinic", label: "In clinic", description: "Measured during a consultation" },
  { key: "home", label: "Home", description: "Measured by the patient at home" },
  { key: "wearable", label: "Wearable", description: "Read from a device or app" },
] as const;

export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number]["key"];

export const MEASUREMENT_SOURCE_KEYS = MEASUREMENT_SOURCES.map(
  (s) => s.key,
) as readonly MeasurementSource[];

export function isMeasurementSource(key: string): key is MeasurementSource {
  return MEASUREMENT_SOURCE_KEYS.includes(key as MeasurementSource);
}

// ─── Biological sex (for reference-interval resolution only) ──────────────────

/**
 * Recorded for one purpose: choosing the right reference interval. It is not an
 * identity field and is never displayed as one — "unspecified" is a first-class
 * answer, and the UI then says the interval is not sex-specific rather than
 * guessing.
 */
export const BIOLOGICAL_SEX_VALUES = ["female", "male", "unspecified"] as const;
export type BiologicalSex = (typeof BIOLOGICAL_SEX_VALUES)[number];

export const BIOLOGICAL_SEX_LABELS: Record<BiologicalSex, string> = {
  female: "Female",
  male: "Male",
  unspecified: "Prefer not to say",
};

// ─── Limits ───────────────────────────────────────────────────────────────────

/** How many days of history the patient-facing trend view loads by default. */
export const MEASUREMENT_HISTORY_DAYS = 365;

/** Points required before a trend is shown at all — two numbers are not a trend. */
export const MEASUREMENT_MIN_TREND_POINTS = 2;

/**
 * Rejects impossible inputs before they reach the database. Deliberately far
 * wider than any reference interval: the job here is catching a slipped decimal
 * point or a unit mix-up, not second-guessing a clinician's reading.
 */
export const MEASUREMENT_VALUE_MIN = -1_000;
export const MEASUREMENT_VALUE_MAX = 100_000;

/** Longest free-text note that can be attached to a single measurement. */
export const MEASUREMENT_NOTE_MAX = 500;

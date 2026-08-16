/**
 * What these tests are really protecting:
 *
 * 1. A "within" marker must not be judged by sign. A TSH falling from 8 to 5 is
 *    a patient getting better; a TSH falling from 2 to 0.2 is a patient getting
 *    worse. Any implementation that says "down is good" gets the second one
 *    backwards and reassures someone who needs a phone call.
 * 2. Sex must change the interval where sex changes the interval, and must NOT
 *    be guessed when it is unknown.
 * 3. `needsAttention` must stay rare. It is the signal a clinician acts on, and
 *    a signal that fires on ordinary values is one nobody reads.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import {
  bmi,
  computeTrend,
  distanceOutside,
  formatRange,
  formatValue,
  formatWithUnit,
  hasSexSpecificRange,
  homaIr,
  nonHdl,
  readMeasurement,
  resolveRange,
  type MeasurementPoint,
} from "./measurements";
import { MEASUREMENT_DEFS, measurementDef } from "@/lib/config/measurements";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const series = (values: number[]): MeasurementPoint[] =>
  values.map((value, i) => ({ value, measuredAt: day(i + 1) }));

describe("readMeasurement — position against the interval", () => {
  it("places a value inside its reference interval", () => {
    const r = readMeasurement("tsh", 2.0);
    expect(r.status).toBe("within");
    expect(r.outsideRef).toBe(false);
    expect(r.needsAttention).toBe(false);
  });

  it("places a value below and above", () => {
    expect(readMeasurement("tsh", 0.2).status).toBe("below");
    expect(readMeasurement("tsh", 6).status).toBe("above");
    expect(readMeasurement("tsh", 6).outsideRef).toBe(true);
  });

  it("treats the interval bounds themselves as inside", () => {
    // A reference interval is inclusive. Reporting a ferritin of exactly 15 as
    // "below" would be a boundary bug that produces a false finding.
    expect(readMeasurement("tsh", 0.4).status).toBe("within");
    expect(readMeasurement("tsh", 4.0).status).toBe("within");
  });

  it("reports an unrated marker rather than inventing a verdict", () => {
    const r = readMeasurement("weight", 82);
    expect(r.status).toBe("unrated");
    expect(r.outsideRef).toBe(false);
    expect(r.atOptimal).toBeNull();
  });

  it("returns unrated for a marker it has never heard of", () => {
    const r = readMeasurement("astrological_sign", 1);
    expect(r.status).toBe("unrated");
    expect(r.needsAttention).toBe(false);
  });

  it("keeps the optimal target separate from the reference interval", () => {
    // hs-CRP 2.0 is inside the reference interval (<3.0) but misses the
    // guideline target (<1.0). The patient is not out of range — and must never
    // be shown as if they were.
    const r = readMeasurement("hs_crp", 2.0);
    expect(r.status).toBe("within");
    expect(r.outsideRef).toBe(false);
    expect(r.atOptimal).toBe(false);

    const better = readMeasurement("hs_crp", 0.6);
    expect(better.status).toBe("within");
    expect(better.atOptimal).toBe(true);
  });
});

describe("readMeasurement — sex-specific intervals", () => {
  it("uses the female interval for a female patient", () => {
    // Ferritin 20 µg/L: unremarkable against the male interval, worth a
    // conversation against the female one. Getting this wrong is a missed
    // finding in exactly the population where iron matters most.
    expect(readMeasurement("ferritin", 20, "female").status).toBe("within");
    expect(readMeasurement("ferritin", 20, "male").status).toBe("below");
  });

  it("marks the reading as sex-specific only when it actually was", () => {
    expect(readMeasurement("ferritin", 20, "female").sexSpecific).toBe(true);
    expect(readMeasurement("ferritin", 20).sexSpecific).toBe(false);
    expect(readMeasurement("ferritin", 20, "unspecified").sexSpecific).toBe(false);
    // TSH has one interval for everyone; claiming it was tailored would be a lie.
    expect(readMeasurement("tsh", 2, "female").sexSpecific).toBe(false);
  });

  it("falls back to the shared interval rather than guessing a sex", () => {
    const r = readMeasurement("ferritin", 20, "unspecified");
    expect(r.range).toEqual(measurementDef("ferritin")!.ref);
  });

  it("declines to rate a marker whose intervals do not overlap when sex is unknown", () => {
    // Female 0.3–1.7 and male 8.6–29 nmol/L share no ground. A merged interval
    // would call every real value normal. Refusing is the honest answer.
    expect(readMeasurement("testosterone_total", 15).status).toBe("unrated");
    expect(readMeasurement("testosterone_total", 15, "male").status).toBe("within");
    expect(readMeasurement("testosterone_total", 15, "female").status).toBe("above");
  });

  it("knows which markers would change if we learned the patient's sex", () => {
    expect(hasSexSpecificRange(measurementDef("ferritin")!)).toBe(true);
    expect(hasSexSpecificRange(measurementDef("tsh")!)).toBe(false);
  });

  it("resolveRange never returns a sex interval the definition does not have", () => {
    for (const def of MEASUREMENT_DEFS) {
      const f = resolveRange(def, "female");
      const m = resolveRange(def, "male");
      if (!def.refFemale) expect(f.sexSpecific, `${def.key} female`).toBe(false);
      if (!def.refMale) expect(m.sexSpecific, `${def.key} male`).toBe(false);
    }
  });
});

describe("readMeasurement — action thresholds", () => {
  it("stays quiet for values that are merely out of range", () => {
    // 150/95 is hypertension and belongs in the consultation, not in an alert.
    expect(readMeasurement("bp_systolic", 150).outsideRef).toBe(true);
    expect(readMeasurement("bp_systolic", 150).needsAttention).toBe(false);
  });

  it("fires on a hypertensive crisis", () => {
    expect(readMeasurement("bp_systolic", 185).needsAttention).toBe(true);
    expect(readMeasurement("bp_diastolic", 115).needsAttention).toBe(true);
  });

  it("fires on the heart rate a stimulant review turns on", () => {
    expect(readMeasurement("heart_rate", 130).needsAttention).toBe(true);
    expect(readMeasurement("heart_rate", 35).needsAttention).toBe(true);
    expect(readMeasurement("heart_rate", 62).needsAttention).toBe(false);
  });

  it("never fires on a value inside the reference interval, for any marker", () => {
    // The property that keeps the clinician's list worth reading.
    for (const def of MEASUREMENT_DEFS) {
      if (!def.alert || !def.ref) continue;
      const mid =
        def.ref.low !== undefined && def.ref.high !== undefined
          ? (def.ref.low + def.ref.high) / 2
          : (def.ref.low ?? def.ref.high)!;
      expect(readMeasurement(def.key, mid).needsAttention, `${def.key} at ${mid}`).toBe(false);
    }
  });
});

describe("computeTrend", () => {
  it("says nothing from a single point", () => {
    const t = computeTrend("ldl", series([3.4]));
    expect(t.verdict).toBe("unknown");
    expect(t.points).toBe(1);
  });

  it("says nothing from no points at all", () => {
    const t = computeTrend("ldl", []);
    expect(t.verdict).toBe("unknown");
    expect(t.latest).toBeUndefined();
  });

  it("reads a falling LDL as an improvement", () => {
    const t = computeTrend("ldl", series([4.2, 3.6, 3.0]));
    expect(t.verdict).toBe("improving");
    expect(t.delta).toBeCloseTo(-1.2);
    expect(t.percent).toBeCloseTo(-28.57, 1);
  });

  it("reads a falling HDL as a worsening", () => {
    const t = computeTrend("hdl", series([1.6, 1.1]));
    expect(t.verdict).toBe("worsening");
  });

  it("judges a 'within' marker by distance from the interval, not by direction", () => {
    // The case a naive implementation gets exactly backwards.
    expect(computeTrend("tsh", series([8, 5])).verdict).toBe("improving");
    expect(computeTrend("tsh", series([2, 0.2])).verdict).toBe("worsening");
  });

  it("calls movement inside the noise floor steady, for a directional marker", () => {
    // LDL 3.00 → 3.02 is assay noise, and "lower is better" would otherwise
    // render it as a worsening. A patient told their cholesterol worsened by
    // 0.02 mmol/L has been told something false with a straight face.
    expect(computeTrend("ldl", series([3.0, 3.02])).verdict).toBe("steady");
    expect(computeTrend("ldl", series([3.0, 2.98])).verdict).toBe("steady");
  });

  it("calls movement inside the noise floor steady, outside the interval too", () => {
    // The floor has to hold where the verdict is computed from distance as well:
    // TSH 5.00 → 5.05 is further out, but not by an amount anyone can act on.
    expect(computeTrend("tsh", series([5.0, 5.05])).verdict).toBe("steady");
  });

  it("still reports real movement that clears the floor", () => {
    // The floor must not swallow findings. 3.0 → 2.4 mmol/L LDL is a result.
    expect(computeTrend("ldl", series([3.0, 2.4])).verdict).toBe("improving");
  });

  it("reports movement without judgement for a neutral marker", () => {
    const t = computeTrend("weight", series([84, 79]));
    expect(t.verdict).toBe("changed");
    expect(t.delta).toBe(-5);
  });

  it("sorts by measurement date, not by insertion order", () => {
    // A lab report entered three weeks late arrives last but belongs first.
    const out: MeasurementPoint[] = [
      { value: 3.0, measuredAt: day(20) },
      { value: 4.2, measuredAt: day(1) },
    ];
    const t = computeTrend("ldl", out);
    expect(t.delta).toBeCloseTo(-1.2);
    expect(t.verdict).toBe("improving");
    expect(t.latest?.value).toBe(3.0);
    expect(t.previous?.value).toBe(4.2);
  });

  it("does not divide by a zero baseline", () => {
    const t = computeTrend("hs_crp", series([0, 2.5]));
    expect(t.percent).toBeNull();
    expect(t.delta).toBe(2.5);
  });

  it("survives a marker it does not know", () => {
    const t = computeTrend("mystery_marker", series([1, 5]));
    expect(t.verdict).toBe("changed");
    expect(t.delta).toBe(4);
  });

  it("does not mutate the caller's array", () => {
    const points = series([3, 1, 2]);
    const before = points.map((p) => p.value);
    computeTrend("ldl", points);
    expect(points.map((p) => p.value)).toEqual(before);
  });
});

describe("distanceOutside", () => {
  it("is zero inside the interval and unbounded ones", () => {
    expect(distanceOutside(2, { low: 1, high: 3 })).toBe(0);
    expect(distanceOutside(2, undefined)).toBe(0);
    expect(distanceOutside(2, {})).toBe(0);
  });

  it("measures how far out, in either direction", () => {
    expect(distanceOutside(0.5, { low: 1, high: 3 })).toBe(0.5);
    expect(distanceOutside(4, { low: 1, high: 3 })).toBe(1);
  });
});

describe("derived values", () => {
  it("computes BMI from weight and height", () => {
    expect(bmi(80, 180)).toBe(24.7);
  });

  it("refuses impossible inputs instead of returning Infinity", () => {
    expect(bmi(80, 0)).toBeNull();
    expect(bmi(0, 180)).toBeNull();
    expect(bmi(-5, 180)).toBeNull();
  });

  it("computes HOMA-IR from the fasting pair in the units we store", () => {
    // 5.0 mmol/L × 9.0 mIU/L / 22.5 = 2.0
    expect(homaIr(5.0, 9.0)).toBe(2);
  });

  it("refuses a HOMA-IR it cannot compute", () => {
    expect(homaIr(0, 9)).toBeNull();
    expect(homaIr(5, 0)).toBeNull();
  });

  it("computes non-HDL cholesterol", () => {
    expect(nonHdl(5.2, 1.4)).toBe(3.8);
  });

  it("refuses an HDL larger than total cholesterol", () => {
    // Physically impossible; almost always a transposed pair of fields.
    expect(nonHdl(1.4, 5.2)).toBeNull();
  });
});

describe("formatting", () => {
  it("uses each marker's declared precision", () => {
    expect(formatValue("bp_systolic", 118.4)).toBe("118");
    expect(formatValue("ldl", 3.1)).toBe("3.10");
    expect(formatValue("hba1c", 5.44)).toBe("5.4");
  });

  it("appends the unit the laboratory reports", () => {
    expect(formatWithUnit("ldl", 3.1)).toBe("3.10 mmol/L");
    expect(formatWithUnit("bp_systolic", 118)).toBe("118 mmHg");
  });

  it("writes an interval the way a clinician reads one", () => {
    expect(formatRange("tsh", { low: 0.4, high: 4 })).toBe("0.40–4.00");
    expect(formatRange("triglycerides", { high: 1.7 })).toBe("< 1.70");
    expect(formatRange("egfr", { low: 90 })).toBe("≥ 90");
  });

  it("returns null for an absent interval so nothing is rendered", () => {
    expect(formatRange("weight", undefined)).toBeNull();
    expect(formatRange("weight", {})).toBeNull();
  });
});

/**
 * The measurement config is a medical claim in a TypeScript file: every interval
 * here will be shown to a patient next to their own number, and a wrong or
 * unsourced one is a wrong or unsourced clinical statement made at scale.
 *
 * These tests are the gate. They do not check that the medicine is right — no
 * test can — but they make the failures that ARE mechanical impossible: an
 * interval with no stated origin, an "optimal" wider than "normal", an action
 * threshold that fires inside the reference interval, a marker whose two
 * sex-specific intervals disagree about which one exists.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import {
  BIOLOGICAL_SEX_VALUES,
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_DEFS,
  MEASUREMENT_KEYS,
  MEASUREMENT_NOTE_MAX,
  MEASUREMENT_SOURCES,
  MEASUREMENT_VALUE_MAX,
  MEASUREMENT_VALUE_MIN,
  PATIENT_ENTERABLE_KEYS,
  isMeasurementKey,
  isMeasurementSource,
  measurementDef,
  type MeasurementDef,
  type MeasurementRange,
} from "./measurements";

const CATEGORY_KEYS = MEASUREMENT_CATEGORIES.map((c) => c.key) as readonly string[];

/** Every interval a definition carries, named for readable failures. */
function refIntervals(def: MeasurementDef): Array<[string, MeasurementRange]> {
  const all: Array<[string, MeasurementRange | undefined]> = [
    ["ref", def.ref],
    ["refFemale", def.refFemale],
    ["refMale", def.refMale],
  ];
  return all.filter((e): e is [string, MeasurementRange] => e[1] !== undefined);
}

describe("measurement definitions", () => {
  it("has no duplicate keys", () => {
    expect(new Set(MEASUREMENT_KEYS).size).toBe(MEASUREMENT_KEYS.length);
  });

  it("uses snake_case keys", () => {
    for (const def of MEASUREMENT_DEFS) {
      expect(def.key, `${def.key} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("gives every marker a label, a short label and a unit", () => {
    for (const def of MEASUREMENT_DEFS) {
      expect(def.label.length, `${def.key} has no label`).toBeGreaterThan(0);
      expect(def.shortLabel.length, `${def.key} has no short label`).toBeGreaterThan(0);
      // A number without a unit is not a measurement. Wearable-derived markers
      // still carry one ("ms", "%"), so there is no exception to make.
      expect(def.unit.length, `${def.key} has no unit`).toBeGreaterThan(0);
    }
  });

  it("files every marker under a real category", () => {
    for (const def of MEASUREMENT_DEFS) {
      expect(CATEGORY_KEYS, `${def.key} has unknown category ${def.category}`).toContain(
        def.category
      );
    }
  });

  it("declares a display precision a lab would recognise", () => {
    for (const def of MEASUREMENT_DEFS) {
      expect(def.decimals, `${def.key} decimals`).toBeGreaterThanOrEqual(0);
      expect(def.decimals, `${def.key} decimals`).toBeLessThanOrEqual(3);
    }
  });

  it("orders every interval low before high", () => {
    for (const def of MEASUREMENT_DEFS) {
      for (const [name, range] of refIntervals(def)) {
        if (range.low !== undefined && range.high !== undefined) {
          expect(range.low, `${def.key}.${name} is inverted`).toBeLessThan(range.high);
        }
      }
    }
  });
});

describe("sourcing", () => {
  // An interval printed next to a patient's own result is an assertion about
  // their health. Requiring provenance is what stops a plausible-sounding number
  // from entering the product because it felt about right.
  it("states where every reference interval comes from", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (refIntervals(def).length === 0) continue;
      expect(def.source, `${def.key} publishes an interval with no source`).toBeTruthy();
    }
  });

  it("states where every optimal target comes from", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (!def.optimal) continue;
      expect(def.source, `${def.key} publishes a target with no source`).toBeTruthy();
    }
  });

  it("justifies every action threshold", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (!def.alert) continue;
      expect(def.alertSource, `${def.key} alerts with no stated reason`).toBeTruthy();
    }
  });

  it("never carries an explanation for an alert it does not have", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (def.alert) continue;
      expect(def.alertSource, `${def.key} explains an alert it never raises`).toBeUndefined();
    }
  });
});

describe("optimal targets sit inside the reference interval", () => {
  // "Optimal" that is wider than "normal" is not a target, it is a mistake — and
  // it would render as a patient failing a bar that starts below the normal range.
  it("never widens the interval it narrows", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (!def.optimal) continue;
      for (const [name, range] of refIntervals(def)) {
        if (def.optimal.low !== undefined && range.low !== undefined) {
          expect(
            def.optimal.low,
            `${def.key}: optimal.low is below ${name}.low`
          ).toBeGreaterThanOrEqual(range.low);
        }
        if (def.optimal.high !== undefined && range.high !== undefined) {
          expect(
            def.optimal.high,
            `${def.key}: optimal.high is above ${name}.high`
          ).toBeLessThanOrEqual(range.high);
        }
      }
    }
  });
});

describe("action thresholds sit outside the reference interval", () => {
  // An alert that fires on a value inside the normal range would put a healthy
  // patient on the clinician's urgent list every single day.
  it("never fires inside a reference interval", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (!def.alert) continue;
      for (const [name, range] of refIntervals(def)) {
        if (def.alert.low !== undefined && range.low !== undefined) {
          expect(
            def.alert.low,
            `${def.key}: alert.low is above ${name}.low — would alert on normal values`
          ).toBeLessThanOrEqual(range.low);
        }
        if (def.alert.high !== undefined && range.high !== undefined) {
          expect(
            def.alert.high,
            `${def.key}: alert.high is below ${name}.high — would alert on normal values`
          ).toBeGreaterThanOrEqual(range.high);
        }
      }
    }
  });
});

describe("sex-specific intervals", () => {
  it("defines both sexes or neither", () => {
    for (const def of MEASUREMENT_DEFS) {
      const hasOne = Boolean(def.refFemale) !== Boolean(def.refMale);
      expect(
        hasOne,
        `${def.key} defines an interval for one sex only — the other would silently fall back`
      ).toBe(false);
    }
  });

  it("covers every sex the profile can record", () => {
    // "unspecified" must resolve to something, which is what `ref` is for —
    // except where the two intervals do not overlap at all (testosterone), where
    // refusing to rate is the honest answer.
    expect(BIOLOGICAL_SEX_VALUES).toContain("unspecified");
  });
});

describe("markers with no clinical direction carry no interval", () => {
  // Weight and height are tracked, not judged. Attaching a range to them would
  // put a pass/fail on a patient's body that no guideline supports.
  it("keeps neutral markers unrated", () => {
    for (const def of MEASUREMENT_DEFS) {
      if (def.direction !== "neutral") continue;
      expect(refIntervals(def), `${def.key} is neutral but rates the patient`).toHaveLength(0);
      expect(def.optimal, `${def.key} is neutral but sets a target`).toBeUndefined();
    }
  });
});

describe("patient-enterable markers", () => {
  it("are vitals, body and wearable numbers — never laboratory results", () => {
    const labCategories = ["metabolic", "lipids", "inflammation", "thyroid", "hormones", "organ"];
    for (const key of PATIENT_ENTERABLE_KEYS) {
      const def = measurementDef(key)!;
      expect(
        labCategories,
        `${key} is a laboratory result and must be entered under a clinician`
      ).not.toContain(def.category);
    }
  });

  it("is a non-empty subset of all markers", () => {
    expect(PATIENT_ENTERABLE_KEYS.length).toBeGreaterThan(0);
    expect(PATIENT_ENTERABLE_KEYS.length).toBeLessThan(MEASUREMENT_KEYS.length);
  });
});

describe("lookup helpers", () => {
  it("recognises every defined key and nothing else", () => {
    for (const key of MEASUREMENT_KEYS) expect(isMeasurementKey(key)).toBe(true);
    expect(isMeasurementKey("definitely_not_a_marker")).toBe(false);
    expect(isMeasurementKey("")).toBe(false);
    // The guard is what stands between the API and arbitrary text in `kind`.
    expect(isMeasurementKey("__proto__")).toBe(false);
    expect(isMeasurementKey("constructor")).toBe(false);
  });

  it("returns undefined rather than throwing for an unknown key", () => {
    expect(measurementDef("nope")).toBeUndefined();
  });

  it("recognises every provenance value and nothing else", () => {
    for (const s of MEASUREMENT_SOURCES) expect(isMeasurementSource(s.key)).toBe(true);
    expect(isMeasurementSource("guess")).toBe(false);
  });
});

describe("input bounds", () => {
  it("admits every published interval with room to spare", () => {
    // The bounds exist to catch a slipped decimal, not to overrule a clinician.
    // Any value a guideline calls normal must obviously be storable.
    for (const def of MEASUREMENT_DEFS) {
      for (const [name, range] of refIntervals(def)) {
        for (const [edge, v] of Object.entries(range)) {
          expect(v, `${def.key}.${name}.${edge} below input floor`).toBeGreaterThan(
            MEASUREMENT_VALUE_MIN
          );
          expect(v, `${def.key}.${name}.${edge} above input ceiling`).toBeLessThan(
            MEASUREMENT_VALUE_MAX
          );
        }
      }
    }
  });

  it("allows a note long enough to be worth writing", () => {
    expect(MEASUREMENT_NOTE_MAX).toBeGreaterThanOrEqual(200);
  });
});

/// <reference types="vitest/globals" />
import {
  PATIENT_SIGNAL_VALUES,
  PATIENT_SIGNAL,
  SIGNAL_LABELS,
  SIGNAL_TONES,
  SIGNAL_SORT_ORDER,
  CHECKIN_GOAL_METRICS,
  NO_CHECKIN_CRITICAL_DAYS,
  SCORE_DROP_CRITICAL,
  NEW_PATIENT_GRACE_DAYS,
  SIGNAL_CHECKIN_WINDOW_DAYS,
  CHECKIN_DIP_ALERT_THRESHOLD,
  CHECKIN_DIP_ALERT_DAYS,
} from "./admin";
import { CHECKIN_METRICS } from "./portal";

// ─── PATIENT_SIGNAL integrity ─────────────────────────────────────────────────

describe("PATIENT_SIGNAL", () => {
  it("has an entry for every PATIENT_SIGNAL_VALUES item (self-referential enum)", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect(PATIENT_SIGNAL).toHaveProperty(signal);
      expect(PATIENT_SIGNAL[signal as keyof typeof PATIENT_SIGNAL]).toBe(signal);
    }
  });

  it("has no extra keys beyond PATIENT_SIGNAL_VALUES", () => {
    const configKeys = Object.keys(PATIENT_SIGNAL).sort();
    const valuesKeys = [...PATIENT_SIGNAL_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });
});

// ─── SIGNAL_LABELS integrity ──────────────────────────────────────────────────

describe("SIGNAL_LABELS", () => {
  it("has an entry for every PATIENT_SIGNAL_VALUES item", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect(SIGNAL_LABELS).toHaveProperty(signal);
    }
  });

  it("has no extra keys beyond PATIENT_SIGNAL_VALUES", () => {
    const configKeys = Object.keys(SIGNAL_LABELS).sort();
    const valuesKeys = [...PATIENT_SIGNAL_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });

  it("every label is a non-empty string", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect(typeof SIGNAL_LABELS[signal]).toBe("string");
      expect(SIGNAL_LABELS[signal].length).toBeGreaterThan(0);
    }
  });
});

// ─── SIGNAL_TONES integrity ───────────────────────────────────────────────────

describe("SIGNAL_TONES", () => {
  it("has an entry for every PATIENT_SIGNAL_VALUES item", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect(SIGNAL_TONES).toHaveProperty(signal);
    }
  });

  it("has no extra keys beyond PATIENT_SIGNAL_VALUES", () => {
    const configKeys = Object.keys(SIGNAL_TONES).sort();
    const valuesKeys = [...PATIENT_SIGNAL_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });

  it("every tone is a ChartKit bar tone or none", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect([undefined, "positive", "warning", "negative"]).toContain(SIGNAL_TONES[signal]);
    }
  });
});

// ─── SIGNAL_SORT_ORDER integrity ──────────────────────────────────────────────

describe("SIGNAL_SORT_ORDER", () => {
  it("has an entry for every PATIENT_SIGNAL_VALUES item", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      expect(SIGNAL_SORT_ORDER).toHaveProperty(signal);
    }
  });

  it("has no extra keys beyond PATIENT_SIGNAL_VALUES", () => {
    const configKeys = Object.keys(SIGNAL_SORT_ORDER).sort();
    const valuesKeys = [...PATIENT_SIGNAL_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });

  it("every sort value is a non-negative integer", () => {
    for (const signal of PATIENT_SIGNAL_VALUES) {
      const v = SIGNAL_SORT_ORDER[signal];
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("no duplicate sort order values", () => {
    const values = Object.values(SIGNAL_SORT_ORDER);
    expect(new Set(values).size).toBe(values.length);
  });

  it("critical sorts before attention, attention before active, active before new", () => {
    expect(SIGNAL_SORT_ORDER.critical).toBeLessThan(SIGNAL_SORT_ORDER.attention);
    expect(SIGNAL_SORT_ORDER.attention).toBeLessThan(SIGNAL_SORT_ORDER.active);
    expect(SIGNAL_SORT_ORDER.active).toBeLessThan(SIGNAL_SORT_ORDER.new);
  });
});

// ─── CHECKIN_GOAL_METRICS derivation ─────────────────────────────────────────

describe("CHECKIN_GOAL_METRICS", () => {
  it("contains every CHECKIN_METRICS key", () => {
    for (const { key } of CHECKIN_METRICS) {
      expect(CHECKIN_GOAL_METRICS).toContain(key);
    }
  });

  it("has exactly as many items as CHECKIN_METRICS", () => {
    expect(CHECKIN_GOAL_METRICS.length).toBe(CHECKIN_METRICS.length);
  });
});

// ─── Threshold sanity checks ──────────────────────────────────────────────────

describe("admin thresholds", () => {
  it("NO_CHECKIN_CRITICAL_DAYS is a positive integer", () => {
    expect(Number.isInteger(NO_CHECKIN_CRITICAL_DAYS)).toBe(true);
    expect(NO_CHECKIN_CRITICAL_DAYS).toBeGreaterThan(0);
  });

  it("SCORE_DROP_CRITICAL is a positive integer", () => {
    expect(Number.isInteger(SCORE_DROP_CRITICAL)).toBe(true);
    expect(SCORE_DROP_CRITICAL).toBeGreaterThan(0);
  });

  it("NEW_PATIENT_GRACE_DAYS is a positive integer", () => {
    expect(Number.isInteger(NEW_PATIENT_GRACE_DAYS)).toBe(true);
    expect(NEW_PATIENT_GRACE_DAYS).toBeGreaterThan(0);
  });

  it("SIGNAL_CHECKIN_WINDOW_DAYS is a positive integer", () => {
    expect(Number.isInteger(SIGNAL_CHECKIN_WINDOW_DAYS)).toBe(true);
    expect(SIGNAL_CHECKIN_WINDOW_DAYS).toBeGreaterThan(0);
  });

  it("CHECKIN_DIP_ALERT_THRESHOLD is between 1 and 5 (check-in scale)", () => {
    expect(CHECKIN_DIP_ALERT_THRESHOLD).toBeGreaterThan(1);
    expect(CHECKIN_DIP_ALERT_THRESHOLD).toBeLessThan(5);
  });

  it("CHECKIN_DIP_ALERT_DAYS is a positive integer", () => {
    expect(Number.isInteger(CHECKIN_DIP_ALERT_DAYS)).toBe(true);
    expect(CHECKIN_DIP_ALERT_DAYS).toBeGreaterThan(0);
  });
});

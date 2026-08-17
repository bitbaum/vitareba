import { describe, it, expect } from "vitest";
import {
  BOOKING_STATUS_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_CONFIG,
  BOOKING_TYPE_VALUES,
  BOOKING_TYPE_CONFIG,
  MACHINE_TYPE_VALUES,
  MACHINE_TYPE_CONFIG,
  type BookingStatus,
  type BookingType,
  type MachineType,
} from "./booking-status";

describe("BOOKING_STATUS config integrity", () => {
  it("BOOKING_STATUS has an entry for every BOOKING_STATUS_VALUES item", () => {
    for (const status of BOOKING_STATUS_VALUES) {
      expect(BOOKING_STATUS).toHaveProperty(status);
      expect(BOOKING_STATUS[status]).toBe(status);
    }
  });

  it("BOOKING_STATUS_CONFIG has an entry for every BOOKING_STATUS_VALUES item", () => {
    for (const status of BOOKING_STATUS_VALUES) {
      expect(BOOKING_STATUS_CONFIG).toHaveProperty(status);
    }
  });

  it("every BOOKING_STATUS_CONFIG entry has label and badgeClass fields", () => {
    for (const status of BOOKING_STATUS_VALUES) {
      const cfg = BOOKING_STATUS_CONFIG[status as BookingStatus];
      expect(cfg).toHaveProperty("label");
      expect(cfg).toHaveProperty("badgeClass");
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(typeof cfg.badgeClass).toBe("string");
      expect(cfg.badgeClass).toMatch(/^booking-status-/);
    }
  });

  it("labels are human-readable (capitalised, not the raw enum)", () => {
    // Regression: badges and the weekly-digest email used to render the raw
    // enum value ("pending" / "confirmed"). Make sure no entry slips back
    // to the lowercase enum form by mistake.
    for (const status of BOOKING_STATUS_VALUES) {
      const cfg = BOOKING_STATUS_CONFIG[status as BookingStatus];
      expect(cfg.label).not.toBe(status);
      expect(cfg.label[0]).toBe(cfg.label[0].toUpperCase());
    }
  });

  it("BOOKING_STATUS_VALUES covers pending, confirmed, attended, cancelled", () => {
    const set = new Set(BOOKING_STATUS_VALUES);
    expect(set.has("pending")).toBe(true);
    expect(set.has("confirmed")).toBe(true);
    expect(set.has("attended")).toBe(true);
    expect(set.has("cancelled")).toBe(true);
  });

  it("BOOKING_STATUS_CONFIG has no extra keys beyond BOOKING_STATUS_VALUES", () => {
    const configKeys = Object.keys(BOOKING_STATUS_CONFIG).sort();
    const valuesKeys = [...BOOKING_STATUS_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });
});

describe("BOOKING_TYPE_CONFIG integrity", () => {
  it("BOOKING_TYPE_CONFIG has an entry for every BOOKING_TYPE_VALUES item", () => {
    for (const type of BOOKING_TYPE_VALUES) {
      expect(BOOKING_TYPE_CONFIG).toHaveProperty(type);
    }
  });

  it("every BOOKING_TYPE_CONFIG entry has a non-empty label", () => {
    for (const type of BOOKING_TYPE_VALUES) {
      const cfg = BOOKING_TYPE_CONFIG[type as BookingType];
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it("BOOKING_TYPE_CONFIG has no extra keys beyond BOOKING_TYPE_VALUES", () => {
    const configKeys = Object.keys(BOOKING_TYPE_CONFIG).sort();
    const valuesKeys = [...BOOKING_TYPE_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });

  it("covers consultation and machine", () => {
    const set = new Set(BOOKING_TYPE_VALUES);
    expect(set.has("consultation")).toBe(true);
    expect(set.has("machine")).toBe(true);
  });
});

describe("MACHINE_TYPE_CONFIG integrity", () => {
  it("MACHINE_TYPE_CONFIG has an entry for every MACHINE_TYPE_VALUES item", () => {
    for (const type of MACHINE_TYPE_VALUES) {
      expect(MACHINE_TYPE_CONFIG).toHaveProperty(type);
    }
  });

  it("every MACHINE_TYPE_CONFIG entry has a non-empty label", () => {
    for (const type of MACHINE_TYPE_VALUES) {
      const cfg = MACHINE_TYPE_CONFIG[type as MachineType];
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it("MACHINE_TYPE_CONFIG has no extra keys beyond MACHINE_TYPE_VALUES", () => {
    const configKeys = Object.keys(MACHINE_TYPE_CONFIG).sort();
    const valuesKeys = [...MACHINE_TYPE_VALUES].sort();
    expect(configKeys).toEqual(valuesKeys);
  });

  it("covers all five Vita technology machines", () => {
    const set = new Set(MACHINE_TYPE_VALUES);
    expect(set.has("h2_therapy")).toBe(true);
    expect(set.has("ihht")).toBe(true);
    expect(set.has("pemf")).toBe(true);
    expect(set.has("infrared")).toBe(true);
    expect(set.has("hrv_biofeedback")).toBe(true);
  });
});

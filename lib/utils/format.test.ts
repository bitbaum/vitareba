/// <reference types="vitest/globals" />
import {
  HOUR_MS,
  DAY_MS,
  formatDateShort,
  formatDateLong,
  formatDateNumeric,
  formatDateTime,
  formatDateMonthDay,
  formatDateISO,
  displayName,
  relativeDate,
  slotParts,
} from "./format";

// Fixed reference date: 2 April 2025, 10:05 UTC
// Using UTC-based construction so the test is timezone-independent for the ISO function.
// For locale-formatted functions we construct from a local date string.
const REF_DATE = new Date("2025-04-02T10:05:00");
const REF_DATE_STR = "2025-04-02T10:05:00";

// ─── Constants ────────────────────────────────────────────────────────────────

describe("time constants", () => {
  it("HOUR_MS is 3 600 000 ms", () => {
    expect(HOUR_MS).toBe(3_600_000);
  });

  it("DAY_MS is 24 × HOUR_MS", () => {
    expect(DAY_MS).toBe(24 * HOUR_MS);
  });
});

// ─── formatDateShort ──────────────────────────────────────────────────────────

describe("formatDateShort", () => {
  it("formats a Date object to 'D Mon YYYY'", () => {
    expect(formatDateShort(REF_DATE)).toMatch(/^2 Apr 2025$/);
  });

  it("accepts a date string and produces the same output as a Date", () => {
    expect(formatDateShort(REF_DATE_STR)).toBe(formatDateShort(REF_DATE));
  });

  it("handles single-digit day without zero-padding", () => {
    expect(formatDateShort(new Date("2025-04-01T12:00:00"))).toMatch(/^1 Apr 2025$/);
  });
});

// ─── formatDateLong ───────────────────────────────────────────────────────────

describe("formatDateLong", () => {
  it("formats a Date object to 'D Month YYYY' with full month name", () => {
    expect(formatDateLong(REF_DATE)).toMatch(/^2 April 2025$/);
  });

  it("accepts a date string and produces the same output as a Date", () => {
    expect(formatDateLong(REF_DATE_STR)).toBe(formatDateLong(REF_DATE));
  });

  it("produces a different output from formatDateShort (full vs abbreviated month)", () => {
    expect(formatDateLong(REF_DATE)).not.toBe(formatDateShort(REF_DATE));
  });
});

// ─── formatDateNumeric ────────────────────────────────────────────────────────

describe("formatDateNumeric", () => {
  it("formats a Date object as numeric locale date (DD/MM/YYYY for en-GB)", () => {
    expect(formatDateNumeric(REF_DATE)).toMatch(/^02\/04\/2025$/);
  });

  it("accepts a date string and produces the same output as a Date", () => {
    expect(formatDateNumeric(REF_DATE_STR)).toBe(formatDateNumeric(REF_DATE));
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("includes day, abbreviated month, hour and minute", () => {
    const result = formatDateTime(REF_DATE);
    expect(result).toMatch(/2 Apr/);
    expect(result).toMatch(/10:05/);
  });

  it("accepts a date string and produces the same output as a Date", () => {
    expect(formatDateTime(REF_DATE_STR)).toBe(formatDateTime(REF_DATE));
  });

  it("zero-pads minutes (05, not 5)", () => {
    expect(formatDateTime(REF_DATE)).toContain("10:05");
  });
});

// ─── formatDateMonthDay ───────────────────────────────────────────────────────

describe("formatDateMonthDay", () => {
  it("formats to 'D Mon' without year", () => {
    expect(formatDateMonthDay(REF_DATE)).toMatch(/^2 Apr$/);
  });

  it("accepts a date string and produces the same output as a Date", () => {
    expect(formatDateMonthDay(REF_DATE_STR)).toBe(formatDateMonthDay(REF_DATE));
  });

  it("does not include the year", () => {
    expect(formatDateMonthDay(REF_DATE)).not.toContain("2025");
  });
});

// ─── displayName ─────────────────────────────────────────────────────────────

describe("displayName", () => {
  it("returns name when provided", () => {
    expect(displayName("Alice Smith", "alice@example.com")).toBe("Alice Smith");
  });

  it("returns email local part when name is null", () => {
    expect(displayName(null, "alice@example.com")).toBe("alice");
  });

  it("returns email local part when name is undefined", () => {
    expect(displayName(undefined, "alice@example.com")).toBe("alice");
  });

  it("returns default fallback 'there' when both name and email are null", () => {
    expect(displayName(null, null)).toBe("there");
  });

  it("returns custom fallback when both name and email are null", () => {
    expect(displayName(null, null, "Unknown")).toBe("Unknown");
  });

  it("returns name even when email is also provided", () => {
    expect(displayName("Bob", "bob@example.com")).toBe("Bob");
  });
});

// ─── relativeDate ─────────────────────────────────────────────────────────────

describe("relativeDate", () => {
  // Use a fixed noon reference to avoid midnight boundary ambiguity
  const now = new Date("2025-04-10T12:00:00");

  it("returns 'Today' when the date matches today", () => {
    expect(relativeDate("2025-04-10", now)).toBe("Today");
  });

  it("returns 'Yesterday' for one day ago", () => {
    expect(relativeDate("2025-04-09", now)).toBe("Yesterday");
  });

  it("returns 'Nd ago' for N days ago", () => {
    expect(relativeDate("2025-04-07", now)).toBe("3d ago");
    expect(relativeDate("2025-04-03", now)).toBe("7d ago");
  });

  it("never returns 'Yesterday' for two days ago", () => {
    expect(relativeDate("2025-04-08", now)).not.toBe("Yesterday");
    expect(relativeDate("2025-04-08", now)).toBe("2d ago");
  });
});

// ─── formatDateISO ────────────────────────────────────────────────────────────

describe("formatDateISO", () => {
  it("returns YYYY-MM-DD string", () => {
    // Use UTC midnight to avoid timezone ambiguity in the ISO slice
    const d = new Date("2025-04-02T00:00:00.000Z");
    expect(formatDateISO(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is exactly 10 characters", () => {
    expect(formatDateISO(new Date("2025-04-02T00:00:00.000Z"))).toHaveLength(10);
  });

  it("contains the correct year", () => {
    expect(formatDateISO(new Date("2025-04-02T00:00:00.000Z"))).toContain("2025");
  });

  // The clinic-timezone contract: "today" is the Zürich calendar day, not UTC.
  // A 00:30 check-in used to be stored under YESTERDAY's date (UTC), silently
  // overwriting it and breaking streaks.
  it("00:30 Zürich summer time (22:30 UTC prev day) is already the new day", () => {
    expect(formatDateISO(new Date("2026-08-10T22:30:00.000Z"))).toBe("2026-08-11");
  });

  it("00:30 Zürich winter time (23:30 UTC prev day) is already the new day", () => {
    expect(formatDateISO(new Date("2026-01-10T23:30:00.000Z"))).toBe("2026-01-11");
  });

  it("23:59 Zürich is still the same day", () => {
    // 21:59 UTC = 23:59 CEST on 11 Aug
    expect(formatDateISO(new Date("2026-08-11T21:59:00.000Z"))).toBe("2026-08-11");
  });
});

// ─── slotParts ────────────────────────────────────────────────────────────────

describe("slotParts", () => {
  // 07:30 UTC = 09:30 Zürich (CEST)
  const MORNING = "2026-08-20T07:30:00.000Z";

  it("splits a slot into the pieces the date rail renders", () => {
    const { weekday, day, month } = slotParts(MORNING);
    expect(weekday).toBe("Thu");
    expect(day).toBe("20");
    expect(month).toBe("Aug");
  });

  it("reports the CLINIC hour, not the reader's — grouping must not shift by timezone", () => {
    expect(slotParts(MORNING).hour).toBe(9);
    // 16:30 UTC = 18:30 Zürich → evening, even though UTC still reads afternoon.
    expect(slotParts("2026-08-20T16:30:00.000Z").hour).toBe(18);
  });

  it("survives winter time (CET, +1)", () => {
    expect(slotParts("2026-01-20T08:30:00.000Z").hour).toBe(9);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(slotParts(new Date(MORNING))).toEqual(slotParts(MORNING));
  });

  it("renders midnight as hour 0, never 24 (24 falls outside every day part)", () => {
    // 22:30 UTC = 00:30 Zürich the next day.
    expect(slotParts("2026-08-19T22:30:00.000Z").hour).toBe(0);
  });
});

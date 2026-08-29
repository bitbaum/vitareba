/// <reference types="vitest/globals" />
import {
  computeProfileCompleteness,
  profileCompletenessColor,
  profileUpdateSchema,
} from "./profile";

// ─── profileUpdateSchema ──────────────────────────────────────────────────────

describe("profileUpdateSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid name string", () => {
    expect(profileUpdateSchema.safeParse({ name: "Manuel Schabus" }).success).toBe(true);
  });

  it("rejects name: '' — min(1) means clients must omit the key instead of sending empty string", () => {
    // This is the root cause of the profile-save bug: Zod rejects "" even though
    // the field is .optional(). Clients must send name: undefined (i.e. omit the key)
    // when the user hasn't set a name.
    const result = profileUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts name: undefined (omitted key)", () => {
    expect(profileUpdateSchema.safeParse({ name: undefined }).success).toBe(true);
  });

  it("accepts empty string for non-min(1) text fields like city", () => {
    expect(profileUpdateSchema.safeParse({ city: "" }).success).toBe(true);
  });

  it("accepts sleepHoursAvg: null (nullable)", () => {
    expect(profileUpdateSchema.safeParse({ sleepHoursAvg: null }).success).toBe(true);
  });

  it("accepts exerciseFrequency: null (nullable)", () => {
    expect(profileUpdateSchema.safeParse({ exerciseFrequency: null }).success).toBe(true);
  });

  it("rejects an invalid exerciseFrequency value", () => {
    expect(profileUpdateSchema.safeParse({ exerciseFrequency: "daily_morning" }).success).toBe(
      false,
    );
  });

  it("accepts a full valid payload", () => {
    const result = profileUpdateSchema.safeParse({
      name: "Manuel Schabus",
      phone: "+41 79 000 00 00",
      dateOfBirth: "1985-05-20",
      city: "Zürich",
      occupation: "Clinician",
      mainConcern: "Focus",
      goals: "Optimise performance",
      diagnosisHistory: "ADHD",
      currentMedications: "None",
      currentSupplements: "Magnesium",
      sleepHoursAvg: 7,
      exerciseFrequency: "moderate",
      referralSource: "Referral",
      notes: "Some notes",
      digestOptOut: false,
      reminderOptOut: true,
    });
    expect(result.success).toBe(true);
  });
});

// ─── computeProfileCompleteness ───────────────────────────────────────────────

describe("computeProfileCompleteness", () => {
  it("returns 0 for null profile", () => {
    expect(computeProfileCompleteness(null)).toBe(0);
  });

  it("returns 0 for undefined profile", () => {
    expect(computeProfileCompleteness(undefined)).toBe(0);
  });

  it("returns 0 for empty profile object", () => {
    expect(computeProfileCompleteness({})).toBe(0);
  });

  it("returns 100 when all 10 clinical fields are filled", () => {
    const full = {
      dateOfBirth: "1990-01-01",
      city: "Zürich",
      occupation: "Engineer",
      mainConcern: "Focus issues",
      goals: "Improve productivity",
      diagnosisHistory: "ADHD diagnosis at 25",
      currentMedications: "None",
      currentSupplements: "Magnesium",
      sleepHoursAvg: 7,
      exerciseFrequency: "moderate",
    };
    expect(computeProfileCompleteness(full)).toBe(100);
  });

  it("returns 50 when exactly 5 of 10 fields are filled", () => {
    const half = {
      dateOfBirth: "1990-01-01",
      city: "Zürich",
      occupation: "Engineer",
      mainConcern: "Focus",
      goals: "Improve",
      // remaining 5 absent
    };
    expect(computeProfileCompleteness(half)).toBe(50);
  });

  it("does not count null field values", () => {
    const profile = {
      dateOfBirth: null,
      city: "Zürich",
    };
    expect(computeProfileCompleteness(profile)).toBe(10); // 1/10
  });

  it("does not count empty-string field values", () => {
    const profile = {
      dateOfBirth: "",
      city: "Zürich",
    };
    expect(computeProfileCompleteness(profile)).toBe(10); // 1/10
  });

  it("ignores extra fields not in the clinical field list", () => {
    const profile = {
      city: "Zürich",
      irrelevantField: "some value",
      anotherExtra: 42,
    };
    expect(computeProfileCompleteness(profile)).toBe(10); // only city counts
  });

  it("returns 10 for a single filled field", () => {
    expect(computeProfileCompleteness({ dateOfBirth: "1985-05-20" })).toBe(10);
  });

  it("treats numeric zero as a filled value (0 is valid for sleepHoursAvg)", () => {
    // 0 is not null/undefined/"" — it should count as filled
    expect(computeProfileCompleteness({ sleepHoursAvg: 0 })).toBe(10);
  });
});

// ─── profileCompletenessColor ─────────────────────────────────────────────────

describe("profileCompletenessColor", () => {
  it("returns teal at 70% (at the high threshold)", () => {
    expect(profileCompletenessColor(70)).toBe("var(--teal)");
  });

  it("returns teal above 70%", () => {
    expect(profileCompletenessColor(100)).toBe("var(--teal)");
    expect(profileCompletenessColor(80)).toBe("var(--teal)");
  });

  it("returns warn at 30% (at the lower threshold)", () => {
    expect(profileCompletenessColor(30)).toBe("var(--warn)");
  });

  it("returns warn between 30% and 70%", () => {
    expect(profileCompletenessColor(50)).toBe("var(--warn)");
    expect(profileCompletenessColor(69)).toBe("var(--warn)");
  });

  it("returns danger below 30%", () => {
    expect(profileCompletenessColor(0)).toBe("var(--danger)");
    expect(profileCompletenessColor(29)).toBe("var(--danger)");
  });
});

/// <reference types="vitest/globals" />
import { programmeUpdateSchema } from "./programmes";
import { PROGRAMME_ENUM_VALUES, PHASE_ENUM_VALUES } from "@/lib/config/programmes";
import { PATIENT_NOTE_MAX_LENGTH, PROGRAMME_START_DATE_MAX_LENGTH } from "@/lib/config/portal";

describe("programmeUpdateSchema", () => {
  it("accepts a minimal valid update (required fields only)", () => {
    const result = programmeUpdateSchema.safeParse({
      programme: PROGRAMME_ENUM_VALUES[0],
      phase: PHASE_ENUM_VALUES[0],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated update", () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "riding_the_wave",
      phase: "active",
      startDate: "2026-01-15",
      notes: "Patient is progressing well.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null startDate and notes", () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "edge_diagnostic",
      phase: "intake",
      startDate: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid programme key", () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "basic_therapy",
      phase: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phase key", () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "riding_the_wave",
      phase: "maintenance",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing programme", () => {
    const result = programmeUpdateSchema.safeParse({ phase: "active" });
    expect(result.success).toBe(false);
  });

  it("rejects missing phase", () => {
    const result = programmeUpdateSchema.safeParse({ programme: "riding_the_wave" });
    expect(result.success).toBe(false);
  });

  it(`rejects startDate longer than ${PROGRAMME_START_DATE_MAX_LENGTH} chars`, () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "riding_the_wave",
      phase: "active",
      startDate: "x".repeat(PROGRAMME_START_DATE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it(`rejects notes longer than ${PATIENT_NOTE_MAX_LENGTH} chars`, () => {
    const result = programmeUpdateSchema.safeParse({
      programme: "riding_the_wave",
      phase: "active",
      notes: "n".repeat(PATIENT_NOTE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts all PROGRAMME_ENUM_VALUES", () => {
    for (const programme of PROGRAMME_ENUM_VALUES) {
      const result = programmeUpdateSchema.safeParse({ programme, phase: PHASE_ENUM_VALUES[0] });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all PHASE_ENUM_VALUES", () => {
    for (const phase of PHASE_ENUM_VALUES) {
      const result = programmeUpdateSchema.safeParse({
        programme: PROGRAMME_ENUM_VALUES[0],
        phase,
      });
      expect(result.success).toBe(true);
    }
  });
});

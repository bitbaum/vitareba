/// <reference types="vitest/globals" />
import { assessmentSaveSchema, assessmentScoresSchema } from "./assessment";
import { DIMENSIONS } from "@/lib/assessment/data";

// Build a valid scores payload from the SSOT DIMENSIONS list — keeps the
// test in sync if a dimension is added or renamed.
function makeValidScores(): Record<string, number> {
  return Object.fromEntries(DIMENSIONS.map((d) => [d.id, 50]));
}

describe("assessmentScoresSchema", () => {
  describe("accepts", () => {
    it("a fully populated, in-range scores object", () => {
      expect(assessmentScoresSchema.safeParse(makeValidScores()).success).toBe(true);
    });

    it("score boundary values 0 and 100", () => {
      const scores = Object.fromEntries(DIMENSIONS.map((d, i) => [d.id, i % 2 === 0 ? 0 : 100]));
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(true);
    });

    it("decimal scores within range", () => {
      const scores = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 33.3]));
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(true);
    });
  });

  describe("rejects", () => {
    it("missing dimension key", () => {
      const scores = makeValidScores();
      delete scores[DIMENSIONS[0].id];
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(false);
    });

    it("unknown extra key (.strict() guard)", () => {
      const scores = { ...makeValidScores(), garbage_key: 50 };
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(false);
    });

    it("score below 0", () => {
      const scores = { ...makeValidScores(), [DIMENSIONS[0].id]: -1 };
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(false);
    });

    it("score above 100", () => {
      const scores = { ...makeValidScores(), [DIMENSIONS[0].id]: 101 };
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(false);
    });

    it("non-numeric score", () => {
      const scores = { ...makeValidScores(), [DIMENSIONS[0].id]: "abc" };
      expect(assessmentScoresSchema.safeParse(scores).success).toBe(false);
    });

    it("empty object", () => {
      expect(assessmentScoresSchema.safeParse({}).success).toBe(false);
    });

    it("only ONE dimension submitted (regression: previous z.record allowed this)", () => {
      expect(assessmentScoresSchema.safeParse({ [DIMENSIONS[0].id]: 50 }).success).toBe(false);
    });
  });

  it("the schema actually contains every dimension from the SSOT list", () => {
    // If a new dimension is added to DIMENSIONS but not picked up by the
    // schema (e.g. wrong export, broken reduce), this catches it.
    const scores = makeValidScores();
    const result = assessmentScoresSchema.safeParse(scores);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(DIMENSIONS.map((d) => d.id).sort());
    }
  });
});

describe("assessmentSaveSchema", () => {
  it("accepts a fully valid save payload", () => {
    expect(
      assessmentSaveSchema.safeParse({ scores: makeValidScores(), overallScore: 72 }).success,
    ).toBe(true);
  });

  it("rejects non-integer overallScore", () => {
    expect(
      assessmentSaveSchema.safeParse({ scores: makeValidScores(), overallScore: 72.5 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range overallScore", () => {
    expect(
      assessmentSaveSchema.safeParse({ scores: makeValidScores(), overallScore: 101 }).success,
    ).toBe(false);
    expect(
      assessmentSaveSchema.safeParse({ scores: makeValidScores(), overallScore: -1 }).success,
    ).toBe(false);
  });

  it("rejects missing scores", () => {
    expect(assessmentSaveSchema.safeParse({ overallScore: 50 }).success).toBe(false);
  });

  it("rejects missing overallScore", () => {
    expect(assessmentSaveSchema.safeParse({ scores: makeValidScores() }).success).toBe(false);
  });
});

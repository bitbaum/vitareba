/// <reference types="vitest/globals" />
import {
  scoreColor,
  getVerdict,
  getVerdictName,
  getInterpretation,
  getInterpretationKey,
  VERDICT_TIERS,
  DIMENSIONS,
  QUESTIONS,
  computeScores,
} from "./data";

// ─── scoreColor ───────────────────────────────────────────────────────────────

describe("scoreColor", () => {
  it("returns teal at score 60 (lower boundary)", () => {
    expect(scoreColor(60)).toBe("var(--teal)");
  });

  it("returns teal above 60", () => {
    expect(scoreColor(100)).toBe("var(--teal)");
    expect(scoreColor(75)).toBe("var(--teal)");
  });

  it("returns warn at score 40 (lower boundary)", () => {
    expect(scoreColor(40)).toBe("var(--warn)");
  });

  it("returns warn between 40 and 59", () => {
    expect(scoreColor(59)).toBe("var(--warn)");
    expect(scoreColor(50)).toBe("var(--warn)");
  });

  it("returns danger below 40", () => {
    expect(scoreColor(0)).toBe("var(--danger)");
    expect(scoreColor(39)).toBe("var(--danger)");
  });
});

// ─── getVerdict ───────────────────────────────────────────────────────────────

describe("getVerdict", () => {
  it("returns Deep Friction for score 0", () => {
    expect(getVerdict(0).name).toBe("Deep Friction");
  });

  it("returns Deep Friction at score 35 (upper boundary)", () => {
    expect(getVerdict(35).name).toBe("Deep Friction");
  });

  it("returns Managed Tension at score 36 (lower boundary)", () => {
    expect(getVerdict(36).name).toBe("Managed Tension");
  });

  it("returns Managed Tension at score 55 (upper boundary)", () => {
    expect(getVerdict(55).name).toBe("Managed Tension");
  });

  it("returns Asymmetric Performance at score 56 (lower boundary)", () => {
    expect(getVerdict(56).name).toBe("Asymmetric Performance");
  });

  it("returns Asymmetric Performance at score 75 (upper boundary)", () => {
    expect(getVerdict(75).name).toBe("Asymmetric Performance");
  });

  it("returns Optimised Neurotype at score 76 (lower boundary)", () => {
    expect(getVerdict(76).name).toBe("Optimised Neurotype");
  });

  it("returns Optimised Neurotype at score 100", () => {
    expect(getVerdict(100).name).toBe("Optimised Neurotype");
  });

  it("falls back to lowest tier for out-of-range score", () => {
    // VERDICT_TIERS[0] is Deep Friction
    expect(getVerdict(999).name).toBe(VERDICT_TIERS[0].name);
  });

  it("covers all four tiers (no gaps between tiers)", () => {
    const names = new Set(Array.from({ length: 101 }, (_, i) => getVerdict(i).name));
    expect(names.size).toBe(4);
  });
});

// ─── getVerdictName ───────────────────────────────────────────────────────────

describe("getVerdictName", () => {
  it("returns a string matching the tier name", () => {
    expect(getVerdictName(20)).toBe("Deep Friction");
    expect(getVerdictName(45)).toBe("Managed Tension");
    expect(getVerdictName(65)).toBe("Asymmetric Performance");
    expect(getVerdictName(90)).toBe("Optimised Neurotype");
  });
});

// ─── getInterpretation ────────────────────────────────────────────────────────

describe("getInterpretation", () => {
  it("returns a non-empty string for every dimension at score 0", () => {
    for (const dim of DIMENSIONS) {
      const text = getInterpretation(dim.id, 0);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("returns a non-empty string for every dimension at score 100", () => {
    for (const dim of DIMENSIONS) {
      const text = getInterpretation(dim.id, 100);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("returns a non-empty string for every dimension at midpoint (50)", () => {
    for (const dim of DIMENSIONS) {
      const text = getInterpretation(dim.id, 50);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("returns empty string for unknown dimension id", () => {
    expect(getInterpretation("nonexistent", 50)).toBe("");
  });
});

// ─── getInterpretationKey ─────────────────────────────────────────────────────

describe("getInterpretationKey", () => {
  it("returns 'low' for scores at or below the first threshold (45)", () => {
    for (const dim of DIMENSIONS) {
      expect(getInterpretationKey(dim.id, 0)).toBe("low");
      expect(getInterpretationKey(dim.id, 45)).toBe("low");
    }
  });

  it("returns 'mid' for scores between 46 and 70 (inclusive)", () => {
    for (const dim of DIMENSIONS) {
      expect(getInterpretationKey(dim.id, 46)).toBe("mid");
      expect(getInterpretationKey(dim.id, 70)).toBe("mid");
    }
  });

  it("returns 'high' for scores from 71 to 100", () => {
    for (const dim of DIMENSIONS) {
      expect(getInterpretationKey(dim.id, 71)).toBe("high");
      expect(getInterpretationKey(dim.id, 100)).toBe("high");
    }
  });

  it("falls back to 'high' for unknown dimension id", () => {
    expect(getInterpretationKey("nonexistent", 50)).toBe("high");
  });

  it("returns one of the three valid keys for every dimension at every integer score", () => {
    const valid = new Set(["low", "mid", "high"]);
    for (const dim of DIMENSIONS) {
      for (let s = 0; s <= 100; s++) {
        expect(valid.has(getInterpretationKey(dim.id, s))).toBe(true);
      }
    }
  });
});

// ─── VERDICT_TIERS i18nKey ────────────────────────────────────────────────────

describe("VERDICT_TIERS i18nKey", () => {
  it("every tier has a non-empty i18nKey", () => {
    for (const tier of VERDICT_TIERS) {
      expect(typeof tier.i18nKey).toBe("string");
      expect(tier.i18nKey.length).toBeGreaterThan(0);
    }
  });

  it("all i18nKeys are unique", () => {
    const keys = VERDICT_TIERS.map((t) => t.i18nKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("i18nKeys match expected values for each score tier", () => {
    expect(getVerdict(20).i18nKey).toBe("deepFriction");
    expect(getVerdict(45).i18nKey).toBe("managedTension");
    expect(getVerdict(65).i18nKey).toBe("asymmetricPerformance");
    expect(getVerdict(90).i18nKey).toBe("optimisedNeurotype");
  });
});

// ─── computeScores ────────────────────────────────────────────────────────────

describe("computeScores", () => {
  const allFives = Array(QUESTIONS.length).fill(5);
  const allOnes = Array(QUESTIONS.length).fill(1);
  const allNulls = Array(QUESTIONS.length).fill(null);

  it("returns 0–100 integers for each dimension", () => {
    const { scores } = computeScores(allFives);
    for (const dim of DIMENSIONS) {
      expect(scores[dim.id]).toBeGreaterThanOrEqual(0);
      expect(scores[dim.id]).toBeLessThanOrEqual(100);
    }
  });

  it("returns overallScore as mean of dimension scores", () => {
    const { scores, overallScore } = computeScores(allFives);
    const expected = Math.round(
      Object.values(scores).reduce((a, b) => a + b, 0) / DIMENSIONS.length,
    );
    expect(overallScore).toBe(expected);
  });

  it("all-null answers produce score 0 for every dimension", () => {
    const { scores, overallScore } = computeScores(allNulls);
    for (const dim of DIMENSIONS) {
      expect(scores[dim.id]).toBe(0);
    }
    expect(overallScore).toBe(0);
  });

  it("all-5 answers produce higher scores than all-1 answers (non-reversed questions dominate)", () => {
    const { overallScore: highScore } = computeScores(allFives);
    const { overallScore: lowScore } = computeScores(allOnes);
    // Net direction: more non-reversed than reversed questions, so 5s beat 1s
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("correctly reverses reversed questions (score 1 on a reversed question = high contribution)", () => {
    const answers = Array(QUESTIONS.length).fill(null) as (number | null)[];
    // Find a reversed question and set it to 1 — should contribute 5 to the dimension
    const reversedIdx = QUESTIONS.findIndex((q) => q.reversed);
    const reversedDim = QUESTIONS[reversedIdx].dimension;
    answers[reversedIdx] = 1;
    const { scores } = computeScores(answers);
    // With one answer of 1 on a reversed question, contribution is (6-1)=5, max is 5 → 100%
    expect(scores[reversedDim]).toBe(100);
  });
});

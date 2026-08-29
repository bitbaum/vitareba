import { z } from "zod";
import { ASSESSMENT_SCORE_MIN, ASSESSMENT_SCORE_MAX, DIMENSIONS } from "@/lib/assessment/data";

// Build the per-dimension scores schema from the SSOT DIMENSIONS list — adding
// or renaming a dimension in lib/assessment/data.ts automatically updates this
// validator. .strict() rejects unknown keys so a client cannot pollute the
// JSONB column with junk fields that downstream renderers (charts, emails)
// don't know how to handle.
const scoreValue = z.number().min(ASSESSMENT_SCORE_MIN).max(ASSESSMENT_SCORE_MAX);

const scoresShape = Object.fromEntries(DIMENSIONS.map((d) => [d.id, scoreValue])) as Record<
  (typeof DIMENSIONS)[number]["id"],
  typeof scoreValue
>;

export const assessmentScoresSchema = z.object(scoresShape).strict();

export const assessmentSaveSchema = z.object({
  scores: assessmentScoresSchema,
  overallScore: z.number().int().min(ASSESSMENT_SCORE_MIN).max(ASSESSMENT_SCORE_MAX),
});

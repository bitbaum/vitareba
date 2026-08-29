import { db } from "@/lib/db";
import { emailQueue } from "@/lib/db/schema";
import { ASSESSMENT_EMAIL_SEQUENCE, WELCOME_EMAIL_SEQUENCE } from "@/lib/config/email-sequences";

// ─── Pure row-builders (testable without DB) ──────────────────────────────────

type AssessmentEmailRow = {
  userId: string;
  templateKey: string;
  sendAt: Date;
  payload: Record<string, unknown>;
};

type WelcomeEmailRow = {
  userId: string;
  templateKey: string;
  sendAt: Date;
  payload: Record<string, unknown>;
};

export function buildAssessmentEmailRows({
  userId,
  overallScore,
  scores,
  triggeredAt,
  isFirstAssessment = true,
}: {
  userId: string;
  overallScore: number;
  scores: Record<string, number>;
  triggeredAt: Date;
  /** When false (retake), only the immediate results email is enqueued — the nurture
   *  sequence (assessmentMeaning +48h, assessmentBooking +5d) fires only on first completion. */
  isFirstAssessment?: boolean;
}): AssessmentEmailRow[] {
  const sequence = isFirstAssessment
    ? ASSESSMENT_EMAIL_SEQUENCE
    : ASSESSMENT_EMAIL_SEQUENCE.filter((step) => step.delayMs === 0);

  return sequence.map((step) => ({
    userId,
    templateKey: step.templateKey,
    sendAt: new Date(triggeredAt.getTime() + step.delayMs),
    payload: { overallScore, scores } as Record<string, unknown>,
  }));
}

export function buildWelcomeEmailRows({
  userId,
  triggeredAt,
}: {
  userId: string;
  triggeredAt: Date;
}): WelcomeEmailRow[] {
  return WELCOME_EMAIL_SEQUENCE.map((step) => ({
    userId,
    templateKey: step.templateKey,
    sendAt: new Date(triggeredAt.getTime() + step.delayMs),
    payload: {} as Record<string, unknown>,
  }));
}

// ─── DB-coupled functions (thin wrappers) ─────────────────────────────────────

export async function enqueueAssessmentEmails(
  params: Parameters<typeof buildAssessmentEmailRows>[0],
) {
  await db.insert(emailQueue).values(buildAssessmentEmailRows(params));
}

export async function enqueueWelcomeEmails(params: Parameters<typeof buildWelcomeEmailRows>[0]) {
  await db.insert(emailQueue).values(buildWelcomeEmailRows(params));
}

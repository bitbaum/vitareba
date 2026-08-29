// Email sequence timing — SSOT for all delay values

import { HOUR_MS, DAY_MS } from "@/lib/utils/format";

export const ASSESSMENT_EMAIL_SEQUENCE = [
  {
    templateKey: "assessmentResults" as const,
    delayMs: 0, // immediate
  },
  {
    templateKey: "assessmentMeaning" as const,
    delayMs: 48 * HOUR_MS, // +48 hours
  },
  {
    templateKey: "assessmentBooking" as const,
    delayMs: 5 * DAY_MS, // +5 days
  },
] as const;

export type AssessmentTemplateKey = (typeof ASSESSMENT_EMAIL_SEQUENCE)[number]["templateKey"];

export const WELCOME_EMAIL_SEQUENCE = [
  {
    templateKey: "welcomePatient" as const,
    delayMs: 0, // immediate
  },
  {
    templateKey: "profileCompletion" as const,
    delayMs: 24 * HOUR_MS, // +24 hours
  },
  {
    templateKey: "assessmentCta" as const,
    delayMs: 72 * HOUR_MS, // +72 hours
  },
] as const;

export type WelcomeTemplateKey = (typeof WELCOME_EMAIL_SEQUENCE)[number]["templateKey"];

export type EmailTemplateKey = AssessmentTemplateKey | WelcomeTemplateKey;

/** Named constants for all template keys — use in cron/emails comparisons instead of string literals */
export const EMAIL_TEMPLATE = {
  assessmentResults: "assessmentResults",
  assessmentMeaning: "assessmentMeaning",
  assessmentBooking: "assessmentBooking",
  welcomePatient: "welcomePatient",
  profileCompletion: "profileCompletion",
  assessmentCta: "assessmentCta",
} as const satisfies Record<EmailTemplateKey, EmailTemplateKey>;

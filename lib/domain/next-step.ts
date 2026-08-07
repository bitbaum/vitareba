// The dashboard's single "next step" — SSOT for the action funnel.
// The portal is mobile-first and reading-minimal: instead of making the
// patient scan N cards, ONE primary action is computed here and rendered as
// the first, biggest, tappable thing on the dashboard. Priority order is a
// clinical-value funnel: baseline data first, daily signal second, dialogue
// third, context/refresh/booking after.

import { PORTAL_ROUTES } from "@/lib/config/routes";
import { ASSESSMENT_STALE_DAYS, PROFILE_NUDGE_THRESHOLD } from "@/lib/config/portal";

export interface NextStepInput {
  hasAssessment: boolean;
  checkedInToday: boolean;
  /** Consecutive days ending yesterday — a streak that dies if today is skipped. */
  atRiskStreak: number;
  unreadMessages: number;
  /** 0–100 */
  profileCompleteness: number;
  /** Days since the latest assessment; Infinity when none. */
  assessmentAgeDays: number;
  hasUpcomingBooking: boolean;
}

export interface NextStep {
  key:
    | "assessment"
    | "checkin"
    | "messages"
    | "profile"
    | "retake"
    | "book"
    | "done";
  href: string;
  /** Imperative, ≤4 words — the only text a user must read. */
  label: string;
  /** One short supporting line. */
  sub: string;
  /** Urgent steps render in the accent treatment. */
  urgent: boolean;
}

export function computeNextStep(s: NextStepInput): NextStep {
  if (!s.hasAssessment) {
    return {
      key: "assessment",
      href: PORTAL_ROUTES.assessment,
      label: "Take the Inflection Edge",
      sub: "10 minutes — the clinical foundation for everything that follows",
      urgent: true,
    };
  }
  if (!s.checkedInToday) {
    return {
      key: "checkin",
      href: PORTAL_ROUTES.checkin,
      label: "Check in now",
      sub:
        s.atRiskStreak >= 2
          ? `30 seconds — keep your ${s.atRiskStreak}-day streak alive`
          : "30 seconds — today's data point",
      urgent: true,
    };
  }
  if (s.unreadMessages > 0) {
    return {
      key: "messages",
      href: PORTAL_ROUTES.messages,
      label: s.unreadMessages === 1 ? "Read Manuel's reply" : "Read Manuel's replies",
      sub: `${s.unreadMessages} unread`,
      urgent: false,
    };
  }
  if (s.profileCompleteness < PROFILE_NUDGE_THRESHOLD) {
    return {
      key: "profile",
      href: PORTAL_ROUTES.profile,
      label: "Complete your profile",
      sub: `${s.profileCompleteness}% done — saves 20 minutes of your first consultation`,
      urgent: false,
    };
  }
  if (s.assessmentAgeDays >= ASSESSMENT_STALE_DAYS) {
    return {
      key: "retake",
      href: PORTAL_ROUTES.assessment,
      label: "Retake the assessment",
      sub: `Last taken ${s.assessmentAgeDays} days ago — see what shifted`,
      urgent: false,
    };
  }
  if (!s.hasUpcomingBooking) {
    return {
      key: "book",
      href: PORTAL_ROUTES.bookings,
      label: "Book a consultation",
      sub: "Your data is ready to discuss",
      urgent: false,
    };
  }
  return {
    key: "done",
    href: PORTAL_ROUTES.assessments,
    label: "All caught up",
    sub: "Checked in, up to date — see your trend",
    urgent: false,
  };
}

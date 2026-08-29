/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { computeNextStep, type NextStepInput } from "./next-step";
import { PORTAL_ROUTES } from "@/lib/config/routes";

const base: NextStepInput = {
  hasAssessment: true,
  checkedInToday: true,
  atRiskStreak: 0,
  unreadMessages: 0,
  profileCompleteness: 100,
  assessmentAgeDays: 5,
  hasUpcomingBooking: true,
};

describe("computeNextStep — priority funnel", () => {
  it("assessment first: without a baseline nothing else matters", () => {
    const step = computeNextStep({
      ...base,
      hasAssessment: false,
      checkedInToday: false,
      unreadMessages: 3,
    });
    expect(step.key).toBe("assessment");
    expect(step.href).toBe(PORTAL_ROUTES.assessment);
    expect(step.urgent).toBe(true);
  });

  it("daily check-in second, with streak framing when at risk", () => {
    const step = computeNextStep({
      ...base,
      checkedInToday: false,
      atRiskStreak: 7,
      unreadMessages: 2,
    });
    expect(step.key).toBe("checkin");
    expect(step.sub).toContain("7-day streak");
    expect(step.urgent).toBe(true);
  });

  it("unread messages third", () => {
    const step = computeNextStep({ ...base, unreadMessages: 1 });
    expect(step.key).toBe("messages");
    expect(step.href).toBe(PORTAL_ROUTES.messages);
  });

  it("profile nudge below threshold", () => {
    const step = computeNextStep({ ...base, profileCompleteness: 40 });
    expect(step.key).toBe("profile");
  });

  it("stale assessment prompts retake", () => {
    const step = computeNextStep({ ...base, assessmentAgeDays: 45 });
    expect(step.key).toBe("retake");
  });

  it("no upcoming booking prompts booking", () => {
    const step = computeNextStep({ ...base, hasUpcomingBooking: false });
    expect(step.key).toBe("book");
  });

  it("everything done → all caught up, linking to results", () => {
    const step = computeNextStep(base);
    expect(step.key).toBe("done");
    expect(step.href).toBe(PORTAL_ROUTES.assessments);
    expect(step.urgent).toBe(false);
  });
});

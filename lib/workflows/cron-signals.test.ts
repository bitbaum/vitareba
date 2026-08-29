/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clinicalGoals, profiles } from "@/lib/db/schema";
import { ASSESSMENT_GOAL_METRIC_KEY } from "@/lib/config/portal";

const {
  mockFindMany,
  mockUpdate,
  mockInsert,
  mockSendEmail,
  mockGetAdminEmails,
  mockCreateNotification,
  mockCreateNotificationForMany,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetAdminEmails: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockCreateNotificationForMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findMany: mockFindMany } },
    update: mockUpdate,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

// The in-app companion to every email in this file — asserted on separately
// (or not at all) so these tests keep testing email/DB behavior, not a 3rd
// concern. See lib/domain/notifications.test.ts for the module itself.
vi.mock("@/lib/domain/notifications", () => ({
  createNotification: mockCreateNotification,
  createNotificationForMany: mockCreateNotificationForMany,
}));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return {
    ...actual,
    getAdminEmails: mockGetAdminEmails,
    PORTAL_URL: "https://portal.example.com",
  };
});

import { runCronSignals } from "./cron-signals";

// now = 2026-05-07T09:00Z
const NOW = new Date("2026-05-07T09:00:00.000Z");
const OLD = new Date("2026-01-01T00:00:00.000Z");

// Last check-in on 2026-05-01: 6 days before NOW in any timezone → critical (threshold = 5)
function criticalPatient(overrides: Record<string, unknown> = {}) {
  return {
    id: "patient-critical",
    name: "Alice",
    email: "alice@example.com",
    createdAt: OLD,
    profile: { lastKnownSignal: null },
    assessmentResults: [{ overallScore: 75, completedAt: new Date("2026-04-01T00:00:00.000Z") }],
    bookings: [{ id: "b1", status: "confirmed", createdAt: new Date("2026-04-01T00:00:00.000Z") }],
    dailyCheckins: [{ date: "2026-05-01", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
    clinicalGoals: [],
    ...overrides,
  };
}

// Last check-in on 2026-05-06: 1 day before NOW → active
function activePatient(overrides: Record<string, unknown> = {}) {
  return {
    id: "patient-active",
    name: "Bob",
    email: "bob@example.com",
    createdAt: OLD,
    profile: { lastKnownSignal: null },
    assessmentResults: [{ overallScore: 75, completedAt: new Date("2026-04-01T00:00:00.000Z") }],
    bookings: [{ id: "b2", status: "confirmed", createdAt: new Date("2026-04-01T00:00:00.000Z") }],
    dailyCheckins: [{ date: "2026-05-06", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
    clinicalGoals: [],
    ...overrides,
  };
}

describe("runCronSignals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockGetAdminEmails.mockReturnValue(["admin@example.com"]);
    mockSendEmail.mockResolvedValue(undefined);
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
    mockCreateNotificationForMany.mockReset().mockResolvedValue(undefined);
    mockUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
    }));
    mockInsert.mockImplementation(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue({}) })),
    }));
  });

  afterEach(() => vi.useRealTimers());

  // ─── DB error ────────────────────────────────────────────────────────────────

  it("returns DB unavailable when the query throws", async () => {
    mockFindMany.mockRejectedValue(new Error("connection refused"));
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: false, error: "Database unavailable" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Empty list ───────────────────────────────────────────────────────────────

  it("returns zero counts for an empty patient list", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ─── Signal transitions ───────────────────────────────────────────────────────

  it("sends critical alert and updates profile when signal transitions null → critical", async () => {
    mockFindMany.mockResolvedValue([criticalPatient()]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 1, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: expect.stringContaining("Critical patient"),
      }),
    );
    expect(mockInsert).toHaveBeenCalledWith(profiles);
  });

  it("sends critical alert when signal transitions active → critical", async () => {
    mockFindMany.mockResolvedValue([criticalPatient({ profile: { lastKnownSignal: "active" } })]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 1, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(profiles);
  });

  it("suppresses alert when patient is already known critical", async () => {
    mockFindMany.mockResolvedValue([criticalPatient({ profile: { lastKnownSignal: "critical" } })]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    // signal unchanged → no profile write
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("updates profile but sends no alert for non-critical signal transition", async () => {
    mockFindMany.mockResolvedValue([activePatient()]); // null → active
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(profiles);
  });

  it("skips profile write when signal is unchanged", async () => {
    mockFindMany.mockResolvedValue([activePatient({ profile: { lastKnownSignal: "active" } })]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("counts alert only when at least one admin email succeeds", async () => {
    mockGetAdminEmails.mockReturnValue(["admin1@example.com", "admin2@example.com"]);
    mockSendEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("inbox full"));
    mockFindMany.mockResolvedValue([criticalPatient()]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 1, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("counts zero alerts when all admin emails fail to deliver", async () => {
    mockSendEmail.mockRejectedValue(new Error("smtp down"));
    mockFindMany.mockResolvedValue([criticalPatient()]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
  });

  it("skips alert when no admin emails are configured but still updates profile", async () => {
    mockGetAdminEmails.mockReturnValue([]);
    mockFindMany.mockResolvedValue([criticalPatient()]);
    const result = await runCronSignals(NOW);
    // no admins → no alert email, but profile still transitions null → critical
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(profiles);
  });

  // ─── Goal tracking ────────────────────────────────────────────────────────────

  it("updates goal current value when check-in metric changed but goal not yet complete", async () => {
    // mood=3 across all checkins → avg = 3 → normalizeCheckinMetric(3) = round((3-1)/(5-1)*100) = 50
    // baseline=0, current=20, target=80 → progress = round((50-0)/(80-0)*100) = 63 → not complete
    mockFindMany.mockResolvedValue([
      activePatient({
        profile: { lastKnownSignal: "active" },
        dailyCheckins: [{ date: "2026-05-06", sleep: 4, energy: 4, mood: 3, focus: 4, stress: 2 }],
        clinicalGoals: [
          {
            id: "goal-1",
            title: "Improve mood",
            metric: "mood",
            baseline: 0,
            current: 20,
            target: 80,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(clinicalGoals);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({ current: 50 });
    expect(setArgs.completedAt).toBeUndefined();
  });

  it("marks goal complete and sends patient + admin emails when check-in metric reaches target", async () => {
    // mood=5 → liveValue = normalizeCheckinMetric(5) = 100
    // baseline=0, current=50, target=100 → progress = 100 → newly complete
    mockFindMany.mockResolvedValue([
      activePatient({
        profile: { lastKnownSignal: "active" },
        dailyCheckins: [{ date: "2026-05-06", sleep: 4, energy: 4, mood: 5, focus: 4, stress: 2 }],
        clinicalGoals: [
          {
            id: "goal-mood",
            title: "Optimise mood",
            metric: "mood",
            baseline: 0,
            current: 50,
            target: 100,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 1, checked: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(clinicalGoals);
    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({ current: 100, completedAt: NOW });

    // admin email + patient email
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: expect.stringContaining("Goal achieved"),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
        subject: expect.stringContaining("Goal achieved"),
      }),
    );
  });

  it("marks goal complete via assessment metric and sends notifications", async () => {
    // assessment score = 80, baseline=50, target=80 → progress = (80-50)/(80-50)*100 = 100
    mockFindMany.mockResolvedValue([
      activePatient({
        profile: { lastKnownSignal: "active" },
        assessmentResults: [
          { overallScore: 80, completedAt: new Date("2026-05-01T09:00:00.000Z") },
        ],
        clinicalGoals: [
          {
            id: "goal-assess",
            title: "Reach target score",
            metric: ASSESSMENT_GOAL_METRIC_KEY,
            baseline: 50,
            current: 70,
            target: 80,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 1, checked: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({ current: 80, completedAt: NOW });
  });

  it("skips goal update when current value is unchanged", async () => {
    // mood=3 → liveValue = 50, goal.current already = 50 → no update needed
    mockFindMany.mockResolvedValue([
      activePatient({
        profile: { lastKnownSignal: "active" },
        dailyCheckins: [{ date: "2026-05-06", sleep: 4, energy: 4, mood: 3, focus: 4, stress: 2 }],
        clinicalGoals: [
          {
            id: "goal-same",
            title: "Mood",
            metric: "mood",
            baseline: 0,
            current: 50,
            target: 80,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips goals with no metric", async () => {
    mockFindMany.mockResolvedValue([
      activePatient({
        profile: { lastKnownSignal: "active" },
        clinicalGoals: [
          {
            id: "goal-no-metric",
            title: "Manual goal",
            metric: null,
            baseline: 0,
            current: 50,
            target: 100,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips assessment metric goal when patient has no assessment data", async () => {
    mockFindMany.mockResolvedValue([
      activePatient({
        assessmentResults: [],
        clinicalGoals: [
          {
            id: "goal-no-data",
            title: "Improve score",
            metric: ASSESSMENT_GOAL_METRIC_KEY,
            baseline: 50,
            current: 60,
            target: 80,
            completedAt: null,
          },
        ],
      }),
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 0, goalsCompleted: 0, checked: 1 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("processes multiple patients independently", async () => {
    mockFindMany.mockResolvedValue([
      criticalPatient(), // null → critical → alert
      activePatient({ profile: { lastKnownSignal: "active" } }), // active → active → no change
    ]);
    const result = await runCronSignals(NOW);
    expect(result).toEqual({ success: true, alerts: 1, goalsCompleted: 0, checked: 2 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1); // only the critical patient profile update
  });
});

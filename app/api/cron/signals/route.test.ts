/// <reference types="vitest/globals" />
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clinicalGoals, profiles } from "@/lib/db/schema";
import { ASSESSMENT_GOAL_METRIC_KEY } from "@/lib/config/portal";

const {
  mockFindMany,
  mockUpdate,
  mockInsert,
  mockSendEmail,
  mockGetAdminEmails,
  mockRequireCron,
  mockCreateNotification,
  mockCreateNotificationForMany,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetAdminEmails: vi.fn(),
  mockRequireCron: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockCreateNotificationForMany: vi.fn(),
}));

vi.mock("@/lib/domain/notifications", () => ({
  createNotification: mockCreateNotification,
  createNotificationForMany: mockCreateNotificationForMany,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findMany: mockFindMany,
      },
    },
    update: mockUpdate,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return {
    ...actual,
    getAdminEmails: mockGetAdminEmails,
    PORTAL_URL: "https://portal.example.com",
  };
});

vi.mock("@/lib/auth/guards", () => ({
  requireCron: mockRequireCron,
}));

import { GET } from "./route";

describe("cron/signals route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));

    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRequireCron.mockReset();
    mockCreateNotification.mockReset().mockResolvedValue(undefined);
    mockCreateNotificationForMany.mockReset().mockResolvedValue(undefined);

    mockRequireCron.mockReturnValue(null);
    mockGetAdminEmails.mockReturnValue([]);
    mockSendEmail.mockResolvedValue(undefined);

    mockUpdate.mockImplementation((table) => ({
      set: vi.fn((values) => ({
        where: vi.fn().mockResolvedValue({ table, values }),
      })),
    }));

    mockInsert.mockImplementation((table) => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue({ table }),
      })),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("still updates signals and goals when no admin emails are configured", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "patient-1",
        name: "Alice",
        email: "alice@example.com",
        createdAt: new Date("2026-01-10T09:00:00.000Z"),
        profile: { lastKnownSignal: null },
        assessmentResults: [
          { overallScore: 80, completedAt: new Date("2026-05-01T09:00:00.000Z") },
        ],
        bookings: [
          { id: "booking-1", status: "confirmed", createdAt: new Date("2026-04-20T09:00:00.000Z") },
        ],
        dailyCheckins: [{ date: "2026-05-01", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
        clinicalGoals: [
          {
            id: "goal-1",
            title: "Improve assessment score",
            metric: ASSESSMENT_GOAL_METRIC_KEY,
            baseline: 50,
            current: 70,
            target: 80,
            completedAt: null,
          },
        ],
      },
    ]);

    const res = await GET(new Request("https://vitareba.ch/api/cron/signals"));
    const json = await res.json();

    expect(json).toEqual({
      success: true,
      alerts: 0,
      goalsCompleted: 1,
      checked: 1,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "Goal achieved: Improve assessment score",
      }),
    );

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(clinicalGoals);

    const goalUpdate = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(goalUpdate).toEqual(
      expect.objectContaining({
        current: 80,
        updatedAt: new Date("2026-05-02T12:00:00.000Z"),
        completedAt: new Date("2026-05-02T12:00:00.000Z"),
      }),
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(profiles);
  });
});

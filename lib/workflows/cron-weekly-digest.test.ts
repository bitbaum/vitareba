/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockSelectWhere, mockSendEmail } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findMany: mockFindMany,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelectWhere,
      })),
    })),
  },
}));

vi.mock("@/lib/email/index", () => ({
  sendEmail: mockSendEmail,
}));

import { runCronWeeklyDigest } from "./cron-weekly-digest";

describe("runCronWeeklyDigest", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockSelectWhere.mockReset();
    mockSendEmail.mockReset();
  });

  it("sends digests to eligible patients and counts failed deliveries as skipped", async () => {
    const now = new Date("2026-05-03T08:00:00.000Z");

    mockFindMany.mockResolvedValue([
      {
        id: "patient-send",
        name: "Alice",
        email: "alice@example.com",
        profile: { digestOptOut: false },
        assessmentResults: [
          { overallScore: 72, completedAt: new Date("2026-05-01T09:00:00.000Z") },
        ],
        bookings: [{ status: "confirmed", createdAt: new Date("2026-05-01T09:00:00.000Z") }],
        clinicalGoals: [{ title: "Focus", baseline: 40, current: 60, target: 80 }],
      },
      {
        id: "patient-skip",
        name: "Bob",
        email: "bob@example.com",
        profile: { digestOptOut: true },
        assessmentResults: [
          { overallScore: 60, completedAt: new Date("2026-04-20T09:00:00.000Z") },
        ],
        bookings: [],
        clinicalGoals: [],
      },
    ]);
    mockSelectWhere.mockResolvedValue([
      {
        userId: "patient-send",
        date: "2026-05-02",
        sleep: 4,
        energy: 4,
        mood: 4,
        focus: 4,
        stress: 2,
      },
      {
        userId: "patient-send",
        date: "2026-05-01",
        sleep: 3,
        energy: 3,
        mood: 3,
        focus: 3,
        stress: 3,
      },
    ]);
    mockSendEmail.mockRejectedValue(new Error("provider down"));

    const result = await runCronWeeklyDigest(now);

    expect(result).toEqual({
      success: true,
      sent: 0,
      skipped: 2,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "Your Vita weekly summary",
      }),
    );
  });
});

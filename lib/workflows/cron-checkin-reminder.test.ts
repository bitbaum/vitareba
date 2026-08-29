/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockSendEmail } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findMany: mockFindMany,
      },
    },
  },
}));

vi.mock("@/lib/email/index", () => ({
  sendEmail: mockSendEmail,
}));

import { runCronCheckinReminder } from "./cron-checkin-reminder";

describe("runCronCheckinReminder", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockSendEmail.mockReset();
  });

  it("sends reminders only to eligible patients and counts failed sends as skipped", async () => {
    const now = new Date("2026-05-03T08:00:00.000Z");

    mockFindMany.mockResolvedValue([
      {
        id: "patient-send",
        name: "Alice",
        email: "alice@example.com",
        profile: { reminderOptOut: false },
        assessmentResults: [{ id: "assessment-1" }],
        dailyCheckins: [
          { date: "2026-05-02", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 },
          { date: "2026-05-01", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 },
        ],
      },
      {
        id: "patient-skip",
        name: "Bob",
        email: "bob@example.com",
        profile: { reminderOptOut: false },
        assessmentResults: [{ id: "assessment-2" }],
        dailyCheckins: [{ date: "2026-05-03", sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
      },
    ]);
    mockSendEmail.mockRejectedValue(new Error("smtp down"));

    const result = await runCronCheckinReminder(now);

    expect(result).toEqual({
      success: true,
      sent: 0,
      skipped: 2,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "🔥 2-day streak — log today to keep it alive",
      }),
    );
  });
});

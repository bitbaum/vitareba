/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailQueue } from "@/lib/db/schema";

const {
  mockFindMany,
  mockBookingFindFirst,
  mockProfileFindFirst,
  mockAssessmentFindFirst,
  mockUpdate,
  mockSendEmail,
  mockIsEmailConfigured,
} = vi.hoisted(() => ({
  mockIsEmailConfigured: vi.fn(),
  mockFindMany: vi.fn(),
  mockBookingFindFirst: vi.fn(),
  mockProfileFindFirst: vi.fn(),
  mockAssessmentFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      emailQueue: {
        findMany: mockFindMany,
      },
      bookings: {
        findFirst: mockBookingFindFirst,
      },
      profiles: {
        findFirst: mockProfileFindFirst,
      },
      assessmentResults: {
        findFirst: mockAssessmentFindFirst,
      },
    },
    update: mockUpdate,
  },
}));

vi.mock("@/lib/email/index", () => ({
  sendEmail: mockSendEmail,
  isEmailConfigured: mockIsEmailConfigured,
}));

import { runCronEmails } from "./cron-emails";

describe("runCronEmails", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockBookingFindFirst.mockReset();
    mockProfileFindFirst.mockReset();
    mockAssessmentFindFirst.mockReset();
    mockUpdate.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ sent: true });
    mockIsEmailConfigured.mockReset();
    mockIsEmailConfigured.mockReturnValue(true);

    mockUpdate.mockImplementation((table) => ({
      set: vi.fn((values) => ({
        where: vi.fn().mockResolvedValue({ table, values }),
      })),
    }));
  });

  it("marks an assessment booking email as sent without delivering when an active booking already exists", async () => {
    const now = new Date("2026-05-03T08:00:00.000Z");

    mockFindMany.mockResolvedValue([
      {
        id: "queue-1",
        userId: "patient-1",
        templateKey: "assessmentBooking",
        payload: { overallScore: 75 },
        user: { name: "Alice", email: "alice@example.com" },
      },
    ]);
    mockBookingFindFirst.mockResolvedValue({ id: "booking-1" });

    const result = await runCronEmails(now);

    expect(result).toEqual({
      success: true,
      sent: 1,
      failed: 0,
      processed: 1,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(emailQueue);
  });

  it("leaves the whole queue pending when the provider is unconfigured — never marks void sends as sent", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const result = await runCronEmails();
    expect(result).toEqual({ success: false, error: "Email provider not configured" });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("marks the row failed when the provider reports a send error", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "q-1",
        userId: "user-1",
        templateKey: "welcome_patient",
        payload: {},
        user: { name: "Alice", email: "alice@example.com" },
      },
    ]);
    mockSendEmail.mockResolvedValue({ sent: false, error: "domain not verified" });
    const result = await runCronEmails();
    expect(result).toMatchObject({ success: true, sent: 0, failed: 1 });
  });

  it("marks unknown templates as failed without attempting delivery", async () => {
    const now = new Date("2026-05-03T08:00:00.000Z");

    mockFindMany.mockResolvedValue([
      {
        id: "queue-2",
        userId: "patient-2",
        templateKey: "unknown-template",
        payload: {},
        user: { name: "Bob", email: "bob@example.com" },
      },
    ]);

    const result = await runCronEmails(now);

    expect(result).toEqual({
      success: true,
      sent: 0,
      failed: 1,
      processed: 1,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(emailQueue);
  });
});

/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profiles } from "@/lib/db/schema";

const { mockFindMany, mockUpdate, mockSendEmail, mockGetAdminEmails, mockRequireCron } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockUpdate: vi.fn(),
    mockSendEmail: vi.fn(),
    mockGetAdminEmails: vi.fn(),
    mockRequireCron: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findMany: mockFindMany,
      },
    },
    update: mockUpdate,
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

function dipPatient() {
  return {
    id: "patient-1",
    name: "Alice",
    email: "alice@example.com",
    profile: null,
    dailyCheckins: [
      { date: "2026-05-01", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
      { date: "2026-04-30", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
      { date: "2026-04-29", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
    ],
  };
}

describe("cron/checkin-dip-alert route", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRequireCron.mockReset();

    mockRequireCron.mockReturnValue(null);
    mockGetAdminEmails.mockReturnValue(["admin1@example.com", "admin2@example.com"]);
    mockFindMany.mockResolvedValue([dipPatient()]);

    mockUpdate.mockImplementation((table) => ({
      set: vi.fn((values) => ({
        where: vi.fn().mockResolvedValue({ table, values }),
      })),
    }));
  });

  it("does not persist dipAlertSentAt when every alert email fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("smtp down"));

    const res = await GET(new Request("https://vitareba.ch/api/cron/checkin-dip-alert"));
    const json = await res.json();

    expect(json).toEqual({
      success: true,
      alerted: 0,
      skipped: 0,
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("persists dipAlertSentAt only after at least one alert email succeeds", async () => {
    mockSendEmail
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("secondary inbox down"));

    const res = await GET(new Request("https://vitareba.ch/api/cron/checkin-dip-alert"));
    const json = await res.json();

    expect(json).toEqual({
      success: true,
      alerted: 1,
      skipped: 0,
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(profiles);
  });
});

/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profiles } from "@/lib/db/schema";
import { CHECKIN_DIP_ALERT_DAYS, CHECKIN_DIP_ALERT_THRESHOLD } from "@/lib/config/admin";

const { mockFindMany, mockUpdate, mockSendEmail, mockGetAdminEmails } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetAdminEmails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findMany: mockFindMany } },
    update: mockUpdate,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return {
    ...actual,
    getAdminEmails: mockGetAdminEmails,
    PORTAL_URL: "https://portal.example.com",
  };
});

import { runCronCheckinDipAlert } from "./cron-checkin-dip-alert";

// CHECKIN_DIP_ALERT_THRESHOLD = 2.5 → (mood + energy + sleep) / 3 <= 2.5
// CHECKIN_DIP_ALERT_DAYS = 3 → need 3 consecutive check-ins all below threshold

const NOW = new Date("2026-05-07T09:00:00.000Z");

// 3 check-ins all well below CHECKIN_DIP_ALERT_THRESHOLD (avg = (2+2+2)/3 = 2.0)
const DIP_CHECKINS = [
  { date: "2026-05-06", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
  { date: "2026-05-05", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
  { date: "2026-05-04", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
];

// 3 check-ins where mood=3 → avg = (2+2+3)/3 = 2.33 — but WAIT:
// threshold uses (mood + energy + sleep) / 3. With mood=3, energy=2, sleep=2: (3+2+2)/3 = 2.33 ≤ 2.5 → still a dip
// Use energy=3 for one day to push above threshold: (3+2+2)/3 = 2.33 — still below
// Use energy=4 for one day: (2+4+2)/3 = 2.67 > 2.5 → NOT a dip day for that day
const NO_DIP_CHECKINS = [
  { date: "2026-05-06", sleep: 2, energy: 4, mood: 2, focus: 2, stress: 4, notes: null }, // avg = (2+4+2)/3 = 2.67 > 2.5
  { date: "2026-05-05", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
  { date: "2026-05-04", sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4, notes: null },
];

function patient(overrides: Record<string, unknown> = {}) {
  return {
    id: "patient-1",
    name: "Alice",
    email: "alice@example.com",
    profile: null,
    dailyCheckins: DIP_CHECKINS,
    ...overrides,
  };
}

describe("runCronCheckinDipAlert", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockGetAdminEmails.mockReturnValue(["admin@example.com"]);
    mockSendEmail.mockResolvedValue(undefined);
    mockUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
    }));
  });

  // ─── DB error ────────────────────────────────────────────────────────────────

  it("returns DB unavailable when the query throws", async () => {
    mockFindMany.mockRejectedValue(new Error("connection refused"));
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: false, error: "Database unavailable" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── No admin emails ──────────────────────────────────────────────────────────

  it("skips all patients when no admin emails are configured", async () => {
    mockGetAdminEmails.mockReturnValue([]);
    mockFindMany.mockResolvedValue([
      patient(),
      patient({ id: "patient-2", email: "bob@example.com" }),
    ]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 0, skipped: 2 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ─── Skip conditions ──────────────────────────────────────────────────────────

  it("skips patients with fewer than CHECKIN_DIP_ALERT_DAYS check-ins", async () => {
    mockFindMany.mockResolvedValue([
      patient({ dailyCheckins: DIP_CHECKINS.slice(0, CHECKIN_DIP_ALERT_DAYS - 1) }),
    ]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 0, skipped: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it(`skips patients whose (mood+energy+sleep)/3 avg exceeds ${CHECKIN_DIP_ALERT_THRESHOLD} on any day`, async () => {
    mockFindMany.mockResolvedValue([patient({ dailyCheckins: NO_DIP_CHECKINS })]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 0, skipped: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips patients whose dip alert was already sent within the cooldown window", async () => {
    // Alert sent 1 day ago → within CHECKIN_DIP_ALERT_DAYS (3) cooldown → skip
    const recentAlert = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([patient({ profile: { dipAlertSentAt: recentAlert } })]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 0, skipped: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Alert conditions ─────────────────────────────────────────────────────────

  it("sends alert and persists dipAlertSentAt when patient has qualifying dip and no prior alert", async () => {
    mockFindMany.mockResolvedValue([patient()]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 1, skipped: 0 });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: expect.stringContaining("Alice"),
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(profiles);
    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({ dipAlertSentAt: NOW });
  });

  it("re-alerts when previous dip alert is older than the cooldown window", async () => {
    // Alert sent CHECKIN_DIP_ALERT_DAYS + 1 days ago → cooldown expired → re-alert
    const oldAlert = new Date(NOW.getTime() - (CHECKIN_DIP_ALERT_DAYS + 1) * 24 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([patient({ profile: { dipAlertSentAt: oldAlert } })]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 1, skipped: 0 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(profiles);
  });

  it("sends to all admin inboxes when multiple admins configured", async () => {
    mockGetAdminEmails.mockReturnValue(["admin1@example.com", "admin2@example.com"]);
    mockFindMany.mockResolvedValue([patient()]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 1, skipped: 0 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("does not persist dipAlertSentAt when all admin emails fail", async () => {
    mockSendEmail.mockRejectedValue(new Error("smtp down"));
    mockFindMany.mockResolvedValue([patient()]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 0, skipped: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("counts alerted only when at least one admin email succeeds", async () => {
    mockGetAdminEmails.mockReturnValue(["admin1@example.com", "admin2@example.com"]);
    mockSendEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("inbox full"));
    mockFindMany.mockResolvedValue([patient()]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 1, skipped: 0 });
    expect(mockUpdate).toHaveBeenCalledWith(profiles);
  });

  it("alerts qualifying patients and skips ineligible ones in the same run", async () => {
    mockFindMany.mockResolvedValue([
      patient(), // qualifies
      patient({ id: "p2", email: "bob@example.com", dailyCheckins: NO_DIP_CHECKINS }), // no dip
      patient({ id: "p3", email: "carol@example.com", dailyCheckins: DIP_CHECKINS.slice(0, 1) }), // too few
    ]);
    const result = await runCronCheckinDipAlert(NOW);
    expect(result).toEqual({ success: true, alerted: 1, skipped: 2 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Alice") }),
    );
  });
});

/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockCheckinFindFirst,
  mockCheckinFindMany,
  mockUserFindFirst,
  mockUpdate,
  mockInsert,
  mockSendEmail,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockCheckinFindFirst: vi.fn(),
  mockCheckinFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockSendEmail: vi.fn(),
  // Capture only — tests invoke the callback explicitly via mock.calls to
  // avoid floating-Promise races (the route calls runAfterResponse without await).
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      dailyCheckins: {
        findFirst: mockCheckinFindFirst,
        findMany: mockCheckinFindMany,
      },
      users: { findFirst: mockUserFindFirst },
    },
    update: mockUpdate,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return { ...actual, PORTAL_URL: "https://portal.example.com" };
});

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET, POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = {
  session: { user: { id: "user-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

// Fixed "now" so relative date assertions are deterministic
const NOW = new Date("2026-05-07T09:00:00.000Z");
const TODAY = "2026-05-07";

const VALID_CHECKIN = { date: TODAY, sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 };

// 7 consecutive check-ins ending today → CHECKIN_STREAK_MILESTONES includes 7 → email fires
const SEVEN_DAY_STREAK = [
  { date: "2026-05-07" },
  { date: "2026-05-06" },
  { date: "2026-05-05" },
  { date: "2026-05-04" },
  { date: "2026-05-03" },
  { date: "2026-05-02" },
  { date: "2026-05-01" },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/checkin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockRequireSession.mockReset();
    mockCheckinFindMany.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET(new Request("https://example.com/api/checkin"));
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB query throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("https://example.com/api/checkin"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns check-in history with todayCheckin identified", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const rows = [
      { date: TODAY, sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 },
      { date: "2026-05-06", sleep: 3, energy: 3, mood: 3, focus: 3, stress: 3 },
    ];
    mockCheckinFindMany.mockResolvedValue(rows);

    const res = await GET(new Request("https://example.com/api/checkin"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.todayCheckin).toMatchObject({ date: TODAY });
    expect(data.checkins).toHaveLength(2);
    // Route reverses the array so output is ascending
    expect(data.checkins[0].date).toBe("2026-05-06");
    expect(data.checkins[1].date).toBe(TODAY);
  });

  it("sets todayCheckin to null when no check-in exists for today", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindMany.mockResolvedValue([
      { date: "2026-05-06", sleep: 3, energy: 3, mood: 3, focus: 3, stress: 3 },
    ]);
    const { data } = await (await GET(new Request("https://example.com/api/checkin"))).json();
    expect(data.todayCheckin).toBeNull();
  });

  it("respects the ?days query param", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindMany.mockResolvedValue([]);
    await GET(new Request("https://example.com/api/checkin?days=14"));
    expect(mockCheckinFindMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 14 }));
  });
});

describe("POST /api/checkin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockRequireSession.mockReset();
    mockCheckinFindFirst.mockReset();
    mockCheckinFindMany.mockReset();
    mockUserFindFirst.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockRunAfterResponse.mockReset();
    mockRunAfterResponse.mockReset(); // clear captured calls between tests
    mockSendEmail.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });
  });

  afterEach(() => vi.useRealTimers());

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid check-in data", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: TODAY, sleep: 6, energy: 4, mood: 4, focus: 4, stress: 2 }), // sleep out of range
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.details).toBeDefined();
  });

  it("returns 500 when the DB save throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    expect(res.status).toBe(500);
  });

  it("updates an existing check-in and does not trigger streak check", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockResolvedValue({ id: "existing-1", date: TODAY }); // already exists

    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("inserts a new check-in and triggers streak milestone check", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockResolvedValue(null); // no existing check-in
    // Streak check fetches history — return 6 days (not a milestone)
    mockCheckinFindMany.mockResolvedValue([
      { date: "2026-05-06" },
      { date: "2026-05-05" },
      { date: "2026-05-04" },
      { date: "2026-05-03" },
      { date: "2026-05-02" },
      { date: "2026-05-01" },
    ]);

    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    // Run the captured callback — 6-day streak is not a milestone → no email
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends a streak milestone email when streak hits 7 days", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockResolvedValue(null);
    mockCheckinFindMany.mockResolvedValue(SEVEN_DAY_STREAK);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });

    const res = await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    expect(res.status).toBe(200);
    // Run the captured callback to trigger the streak check
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("7-day streak"),
      }),
    );
  });

  it("does not send milestone email when streak is not a milestone value", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockResolvedValue(null);
    // 5 consecutive days — not in CHECKIN_STREAK_MILESTONES [7, 30, 100]
    mockCheckinFindMany.mockResolvedValue([
      { date: "2026-05-07" },
      { date: "2026-05-06" },
      { date: "2026-05-05" },
      { date: "2026-05-04" },
      { date: "2026-05-03" },
    ]);

    await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not send milestone email when user has no email address", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockCheckinFindFirst.mockResolvedValue(null);
    mockCheckinFindMany.mockResolvedValue(SEVEN_DAY_STREAK);
    mockUserFindFirst.mockResolvedValue(null); // user not found

    await POST(
      new Request("https://example.com/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_CHECKIN),
      }),
    );
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

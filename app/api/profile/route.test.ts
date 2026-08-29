/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockProfileFindFirst,
  mockUserFindFirst,
  mockUpdate,
  mockInsert,
  mockSendEmail,
  mockGetAdminEmails,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockProfileFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetAdminEmails: vi.fn(),
  // Capture only — tests invoke the callback explicitly via mock.calls to
  // avoid floating-Promise races (the route calls runAfterResponse without await).
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      profiles: { findFirst: mockProfileFindFirst },
      users: { findFirst: mockUserFindFirst },
    },
    update: mockUpdate,
    insert: mockInsert,
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

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET, PATCH } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = {
  session: { user: { id: "user-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

// PROFILE_COMPLETION_FIELDS has 10 items; PROFILE_COMPLETION_THRESHOLD = 0.7 → 70%
// 6 filled → Math.round(6/10 * 100) = 60  (below threshold)
// 7 filled → Math.round(7/10 * 100) = 70  (at threshold — triggers notification)

const PROFILE_60PCT = {
  userId: "user-1",
  dateOfBirth: "1990-01-01",
  city: "Zürich",
  occupation: "Engineer",
  mainConcern: "Focus",
  goals: "Improve",
  diagnosisHistory: "ADHD",
  currentMedications: null,
  currentSupplements: null,
  sleepHoursAvg: null,
  exerciseFrequency: null,
};

const PROFILE_70PCT = { ...PROFILE_60PCT, currentMedications: "Ritalin" };
const PROFILE_80PCT = { ...PROFILE_70PCT, currentSupplements: "Omega 3" };

const VALID_PATCH = {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ city: "Zürich" }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupInsert(returning: object[]) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returning),
      }),
    }),
  });
}

function setupUpdate() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/profile", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockProfileFindFirst.mockReset();
    mockUserFindFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB query throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockRejectedValue(new Error("db down"));
    mockUserFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns merged profile and user data", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_60PCT);
    mockUserFindFirst.mockResolvedValue({
      name: "Alice",
      email: "alice@example.com",
      image: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.city).toBe("Zürich");
    expect(data.name).toBe("Alice");
    expect(data.email).toBe("alice@example.com");
    expect(data.memberSince).toBeTruthy();
  });

  it("returns null profile fields when no profile row exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(undefined);
    mockUserFindFirst.mockResolvedValue({
      name: "Alice",
      email: "alice@example.com",
      image: null,
      createdAt: new Date(),
    });
    const res = await GET();
    const { data } = await res.json();
    expect(data.city).toBeUndefined();
    expect(data.name).toBe("Alice");
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockProfileFindFirst.mockReset();
    mockUserFindFirst.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset(); // clear captured calls between tests
    mockGetAdminEmails.mockReturnValue(["admin@example.com"]);
    mockSendEmail.mockResolvedValue(undefined);
    setupUpdate();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await PATCH(
      new Request("https://example.com/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sleepHoursAvg: 99 }), // out of valid range
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB upsert throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_60PCT);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("db down")),
        }),
      }),
    });
    const res = await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(res.status).toBe(500);
  });

  it("sends admin notification when completeness crosses the 70% threshold", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_60PCT); // existing: 60%
    setupInsert([PROFILE_70PCT]); // updated: 70% — crosses threshold
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });

    const res = await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(res.status).toBe(200);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    // Run the captured callback explicitly to verify the email is sent
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin@example.com"],
        subject: expect.stringContaining("Profile ready"),
      }),
    );
  });

  it("does not notify admin when completeness stays below threshold", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_60PCT); // 60%
    setupInsert([PROFILE_60PCT]); // still 60%

    await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("does not notify admin when completeness was already at or above threshold", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_70PCT); // existing: 70%
    setupInsert([PROFILE_80PCT]); // updated: 80% — no crossing

    await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("skips notification email when no admin emails are configured", async () => {
    mockGetAdminEmails.mockReturnValue([]);
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_60PCT);
    setupInsert([PROFILE_70PCT]);

    await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    // runAfterResponse not called because getAdminEmails returned []
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("calls db.update(users) when name field is included in patch body", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_70PCT);
    setupInsert([PROFILE_70PCT]);

    await PATCH(
      new Request("https://example.com/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice Updated" }),
      }),
    );
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("does not call db.update(users) when name is not in patch body", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockProfileFindFirst.mockResolvedValue(PROFILE_70PCT);
    setupInsert([PROFILE_70PCT]);

    await PATCH(new Request("https://example.com/api/profile", VALID_PATCH));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

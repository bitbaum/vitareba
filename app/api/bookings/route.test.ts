/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockBookingFindMany,
  mockUserFindFirst,
  mockInsert,
  mockSendEmail,
  mockGetAdminEmails,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBookingFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
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
      bookings: { findMany: mockBookingFindMany },
      users:    { findFirst: mockUserFindFirst },
    },
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return { ...actual, getAdminEmails: mockGetAdminEmails, PORTAL_URL: "https://portal.example.com" };
});

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET, POST } from "./route";
import { generateSlots } from "@/lib/domain/scheduling";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PATIENT_SESSION = { session: { user: { id: "user-1", role: "patient", email: "alice@example.com" } }, error: null };
const ADMIN_SESSION   = { session: { user: { id: "admin-1", role: "admin",   email: "admin@example.com" } }, error: null };
const UNAUTH          = { session: null, error: new Response(null, { status: 401 }) };

const BOOKING = {
  id: "booking-1", userId: "user-1", status: "pending",
  bookingType: "consultation", machineType: null,
  preferredDate: null, notes: null, createdAt: new Date("2026-05-07T00:00:00.000Z"),
};

const VALID_PATIENT_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bookingType: "consultation" }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupInsert(returning: object[]) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returning),
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/bookings", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockBookingFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB query throws", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns bookings for the authenticated patient", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindMany.mockResolvedValue([BOOKING]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
  });
});

describe("POST /api/bookings (patient)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockSendEmail.mockResolvedValue(undefined);
    setupInsert([BOOKING]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(new Request("https://example.com/api/bookings", VALID_PATIENT_POST));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid booking type", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingType: "invalid_type" }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(new Request("https://example.com/api/bookings", VALID_PATIENT_POST));
    expect(res.status).toBe(500);
  });

  it("creates booking without scheduling notification when no admin emails configured", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockGetAdminEmails.mockReturnValue([]);
    const res = await POST(new Request("https://example.com/api/bookings", VALID_PATIENT_POST));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("schedules admin notification email when admin emails are configured", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockGetAdminEmails.mockReturnValue(["admin@example.com"]);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });

    const res = await POST(new Request("https://example.com/api/bookings", VALID_PATIENT_POST));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin@example.com"],
        subject: expect.stringContaining("consultation request"),
      })
    );
  });
});

describe("POST /api/bookings (patient, slot)", () => {
  const NOW_SLOT = generateSlots({ now: new Date(), busy: [] })[0];

  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockBookingFindMany.mockReset();
    mockGetAdminEmails.mockReturnValue([]);
    mockBookingFindMany.mockResolvedValue([]); // no busy intervals
    setupInsert([{ ...BOOKING, status: "confirmed", scheduledAt: NOW_SLOT }]);
  });

  function slotReq(slot: string) {
    return new Request("http://test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
  }

  it("books an offered slot as confirmed", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(slotReq(NOW_SLOT.toISOString()));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.status).toBe("confirmed");
  });

  it("rejects an off-grid instant with 409", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const offGrid = new Date(NOW_SLOT.getTime() + 7 * 60_000);
    const res = await POST(slotReq(offGrid.toISOString()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("slot_taken");
  });

  it("maps a unique-index race (23505) to 409 slot_taken, not a 500", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockInsert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" })),
      })),
    }));
    const res = await POST(slotReq(NOW_SLOT.toISOString()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("slot_taken");
  });
});

describe("POST /api/bookings (admin)", () => {
  const PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // valid v4 UUID

  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockSendEmail.mockResolvedValue(undefined);
    setupInsert([{ ...BOOKING, userId: PATIENT_ID }]);
  });

  it("returns 400 when patientId is missing", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingType: "consultation" }), // missing patientId
    }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: PATIENT_ID, bookingType: "consultation" }),
    }));
    expect(res.status).toBe(500);
  });

  it("creates booking and schedules patient confirmation email", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });

    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: PATIENT_ID, bookingType: "consultation" }),
    }));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("confirmed"),
      })
    );
  });
});

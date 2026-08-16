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
  mockCalendarBusyFindMany,
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
  // The slot engine now also consults each clinician's subscribed calendar.
  mockCalendarBusyFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: { findMany: mockBookingFindMany },
      users:    { findFirst: mockUserFindFirst },
      calendarBusy: { findMany: mockCalendarBusyFindMany },
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
import { DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Real UUIDs: "who is this booking for" is a uuid-validated field, so a
// placeholder id would fail the schema and hide the permission check behind it.
const PATIENT_ID_SELF  = "b1111111-1111-4111-8111-111111111111";
const OTHER_PATIENT_ID = "c2222222-2222-4222-8222-222222222222";
const PATIENT_SESSION = { session: { user: { id: PATIENT_ID_SELF, role: "patient", email: "alice@example.com" } }, error: null };
const ADMIN_SESSION   = { session: { user: { id: "admin-1", role: "admin",   email: "admin@example.com" } }, error: null };
const UNAUTH          = { session: null, error: new Response(null, { status: 401 }) };

const BOOKING = {
  id: "booking-1", userId: PATIENT_ID_SELF, status: "pending",
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

/** The row the route actually tried to write — what it inserted, not what it returned. */
function insertedValues(): Record<string, unknown> {
  const values = mockInsert.mock.results[0]?.value?.values;
  return values?.mock?.calls?.[0]?.[0] ?? {};
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
  const NOW_SLOT = generateSlots({ now: new Date(), rules: DEFAULT_AVAILABILITY, busy: [] })[0];
  const CLINICIAN_ID = "11111111-1111-4111-8111-111111111111";
  const CLINICIAN = { id: CLINICIAN_ID, name: "Manuel", email: "manuel@example.com" };

  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockBookingFindMany.mockReset();
    mockUserFindFirst.mockReset();
    mockGetAdminEmails.mockReturnValue([]);
    mockUserFindFirst.mockResolvedValue(CLINICIAN); // clinician lookup
    mockBookingFindMany.mockResolvedValue([]); // no booked appointments
    mockCalendarBusyFindMany.mockResolvedValue([]); // no external calendar events
    setupInsert([{ ...BOOKING, status: "confirmed", scheduledAt: NOW_SLOT }]);
  });

  function slotReq(slot: string, clinicianId: string = CLINICIAN_ID) {
    return new Request("http://test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, clinicianId }),
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

  it("rejects an unknown clinician with 400", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue(undefined);
    const res = await POST(slotReq(NOW_SLOT.toISOString()));
    expect(res.status).toBe(400);
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

  // ── The external calendar ─────────────────────────────────────────────────
  //
  // The entire promise of subscribing a clinician's calendar is this one
  // behaviour: an hour they are busy in their own calendar cannot be booked
  // here. Everything else in that feature — the parser, the fetcher, the cron —
  // exists only to make this assertion true.
  it("refuses a slot the clinician's own calendar says is taken", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockCalendarBusyFindMany.mockResolvedValue([
      {
        startsAt: NOW_SLOT,
        endsAt: new Date(NOW_SLOT.getTime() + 60 * 60_000),
      },
    ]);
    const res = await POST(slotReq(NOW_SLOT.toISOString()));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("slot_taken");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("still offers a slot the external calendar does not cover", async () => {
    // The other half: blocking everything would also pass the test above.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockCalendarBusyFindMany.mockResolvedValue([
      {
        startsAt: new Date(NOW_SLOT.getTime() + 5 * 24 * 60 * 60_000),
        endsAt: new Date(NOW_SLOT.getTime() + 5 * 24 * 60 * 60_000 + 60 * 60_000),
      },
    ]);
    expect((await POST(slotReq(NOW_SLOT.toISOString()))).status).toBe(201);
  });

  // ── The cell this matrix was missing ──────────────────────────────────────
  //
  // Slot bookings were only ever tested with a patient session, and admin
  // bookings only ever with a patientId. Nothing exercised "an admin picks a
  // time for themselves" — which is the ordinary case at a practice whose
  // clinicians are their own patients, and which returned 400 for months while
  // every test stayed green. Absence is what a test suite is worst at seeing.
  it("books a slot for an admin booking their OWN appointment", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(slotReq(NOW_SLOT.toISOString()));
    expect(res.status).toBe(201);
    // Assert the ROW THE ROUTE WROTE, not the row the mock was told to return.
    // Checking the response body only proves the fixture is what the fixture
    // says it is — a 201 carrying a fake "confirmed" hid this very bug once,
    // because falling through to the request handler also answers 201.
    expect(insertedValues()).toMatchObject({
      userId: ADMIN_SESSION.session.user.id,
      clinicianId: CLINICIAN_ID,
      scheduledAt: NOW_SLOT,
      status: "confirmed",
    });
  });

  it("gives an admin's own slot booking a real time, not a request without one", async () => {
    // The precise shape of the regression: a slot body handled by the plain
    // request branch inserts successfully and answers 201, with no scheduledAt
    // and no clinician. It looks like it worked and books nothing.
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    await POST(slotReq(NOW_SLOT.toISOString()));
    const row = insertedValues();
    expect(row.scheduledAt, "booked without a time").toBeInstanceOf(Date);
    expect(row.clinicianId, "booked with nobody").toBe(CLINICIAN_ID);
  });

  it("lets an admin book a slot on a named patient's behalf", async () => {
    // Taking a booking over the phone is a real thing a clinic does.
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: NOW_SLOT.toISOString(),
        clinicianId: CLINICIAN_ID,
        patientId: OTHER_PATIENT_ID,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(insertedValues()).toMatchObject({
      userId: OTHER_PATIENT_ID,
      clinicianId: CLINICIAN_ID,
      scheduledAt: NOW_SLOT,
    });
  });

  it("refuses to let a patient book a slot in someone else's name", async () => {
    // The permission that role is actually for. Without this check, "who it is
    // for" being a parameter would let anyone book against any account.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const req = new Request("http://test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: NOW_SLOT.toISOString(),
        clinicianId: CLINICIAN_ID,
        patientId: OTHER_PATIENT_ID,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("still lets a patient send their own id explicitly", async () => {
    // Harmless and honest: it names themselves. Rejecting it would be a trap
    // for any client that fills the field in for every request.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const req = new Request("http://test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: NOW_SLOT.toISOString(),
        clinicianId: CLINICIAN_ID,
        patientId: PATIENT_SESSION.session.user.id,
      }),
    });
    expect((await POST(req)).status).toBe(201);
    expect(insertedValues()).toMatchObject({ userId: PATIENT_ID_SELF, scheduledAt: NOW_SLOT });
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
    mockGetAdminEmails.mockReturnValue([]);
    setupInsert([{ ...BOOKING, userId: PATIENT_ID }]);
  });

  it("treats an admin request with no patientId as a booking for themselves", async () => {
    // This asserted 400 before, and the 400 was the bug: it meant a clinician
    // could not request their own appointment, at a practice where clinicians
    // are patients by design. Naming nobody means naming yourself.
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingType: "consultation" }),
    }));
    expect(res.status).toBe(201);
    expect(insertedValues()).toMatchObject({ userId: ADMIN_SESSION.session.user.id });
  });

  it("refuses a patient who names someone else, without a fixed time", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(new Request("https://example.com/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: PATIENT_ID, bookingType: "consultation" }),
    }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
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

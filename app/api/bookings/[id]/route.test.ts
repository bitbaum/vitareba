/// <reference types="vitest/globals" />
/**
 * Cancelling and moving one appointment, from both sides.
 *
 * What these tests are really holding in place:
 *
 *  • A PATIENT CAN GET OUT. The previous version let a patient cancel only a
 *    `pending` booking — and slot bookings are created `confirmed`, so the
 *    moment picking a time worked, every patient was stuck with it. That is the
 *    single most important assertion in this file.
 *  • SOMEONE ELSE'S APPOINTMENT IS A 404, never a 403. A 403 confirms the id is
 *    real, which is a disclosure about another patient at a psychiatric clinic.
 *  • MOVING AN APPOINTMENT BUMPS THE CALENDAR REVISION. Without it the entry in
 *    the patient's phone keeps the old time forever, and they arrive on the
 *    wrong day having done everything right.
 *  • AN APPOINTMENT DOES NOT BLOCK ITS OWN MOVE. The naive re-check treats the
 *    booking being moved as a busy interval, so rescheduling always collides
 *    with itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockBookingFindFirst,
  mockUserFindFirst,
  mockUpdate,
  mockSendEmail,
  mockGetAdminEmails,
  mockRunAfterResponse,
  mockGetBusyIntervals,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBookingFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetAdminEmails: vi.fn(),
  mockRunAfterResponse: vi.fn(),
  mockGetBusyIntervals: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      bookings: { findFirst: mockBookingFindFirst },
      users: { findFirst: mockUserFindFirst },
    },
    update: mockUpdate,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/domain/scheduling-data", () => ({ getBusyIntervals: mockGetBusyIntervals }));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return { ...actual, getAdminEmails: mockGetAdminEmails, PORTAL_URL: "https://portal.example.com" };
});

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { PATCH, DELETE } from "./route";
import { generateSlots } from "@/lib/domain/scheduling";
import { DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";
import { CANCELLATION_NOTICE_HOURS } from "@/lib/config/cancellation";
import { HOUR_MS } from "@/lib/utils/format";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin", email: "admin@example.com" } }, error: null };
const PATIENT_SESSION = { session: { user: { id: "patient-1", role: "patient", email: "alice@example.com" } }, error: null };
const OTHER_PATIENT = { session: { user: { id: "patient-2", role: "patient", email: "bob@example.com" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const CLINICIAN_ID = "11111111-1111-4111-8111-111111111111";
const CLINICIAN = { id: CLINICIAN_ID, name: "Manuel", email: "manuel@example.com" };

const VALID_BOOKING_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_BOOKING_ID }) };

/** A slot the engine genuinely offers right now — never a hand-picked instant. */
const FREE_SLOT = generateSlots({ now: new Date(), rules: DEFAULT_AVAILABILITY, busy: [] })[0];

function booking(over: Record<string, unknown> = {}) {
  return {
    id: VALID_BOOKING_ID,
    userId: "patient-1",
    status: "confirmed",
    bookingType: "consultation",
    machineType: null,
    preferredDate: null,
    // Comfortably outside the notice window unless a test says otherwise.
    scheduledAt: new Date(Date.now() + 10 * 24 * HOUR_MS),
    clinicianId: CLINICIAN_ID,
    notes: null,
    revision: 0,
    rescheduledFrom: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    lateCancellation: false,
    createdAt: new Date("2026-05-07T00:00:00.000Z"),
    ...over,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupUpdate(returning: object[]) {
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }),
  });
  mockUpdate.mockReturnValue({ set });
  return set;
}

/** The column patch the route actually wrote. */
function updatedValues(): Record<string, unknown> {
  const set = mockUpdate.mock.results[0]?.value?.set;
  return set?.mock?.calls?.[0]?.[0] ?? {};
}

function req(body?: unknown) {
  return new Request("https://example.com/api/bookings/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminEmails.mockReturnValue([]);
  mockSendEmail.mockResolvedValue(undefined);
  mockUserFindFirst.mockResolvedValue(CLINICIAN);
  mockGetBusyIntervals.mockResolvedValue([]);
  mockBookingFindFirst.mockResolvedValue(booking());
  setupUpdate([booking()]);
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe("DELETE — cancelling", () => {
  it("rejects an unauthenticated caller", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await DELETE(req(), PARAMS)).status).toBe(401);
  });

  it("rejects a malformed id before touching the database", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await DELETE(req(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(400);
    expect(mockBookingFindFirst).not.toHaveBeenCalled();
  });

  it("lets a patient cancel their own CONFIRMED appointment", async () => {
    // The regression that mattered: this used to be refused because the booking
    // was not `pending`, which is the status every slot booking starts in.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedValues()).toMatchObject({ status: "cancelled", cancelledBy: "patient-1" });
  });

  it("works when the request carries no body at all", async () => {
    // A cancel button that fails because it sent nothing is a poor way to learn
    // that the reason field is optional.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    expect((await DELETE(req(), PARAMS)).status).toBe(200);
  });

  it("records the reason when one is given", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    await DELETE(req({ reason: "Unwell" }), PARAMS);
    expect(updatedValues()).toMatchObject({ cancellationReason: "Unwell" });
  });

  it("answers 404, not 403, for someone else's appointment", async () => {
    mockRequireSession.mockResolvedValue(OTHER_PATIENT);
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that does not exist", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(undefined);
    expect((await DELETE(req(), PARAMS)).status).toBe(404);
  });

  it("lets an admin cancel any appointment", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    expect((await DELETE(req(), PARAMS)).status).toBe(200);
    expect(updatedValues()).toMatchObject({ cancelledBy: "admin-1" });
  });

  it("flags a late cancellation but still allows it", async () => {
    // The policy in one assertion: inside the window it is RECORDED, not refused.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(
      booking({ scheduledAt: new Date(Date.now() + (CANCELLATION_NOTICE_HOURS - 2) * HOUR_MS) })
    );
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { late: true } });
    expect(updatedValues()).toMatchObject({ lateCancellation: true });
  });

  it("does not flag a cancellation made with notice", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await DELETE(req(), PARAMS);
    expect(await res.json()).toMatchObject({ data: { late: false } });
    expect(updatedValues()).toMatchObject({ lateCancellation: false });
  });

  it("refuses to cancel an appointment that already happened", async () => {
    // Cancelling the past would rewrite what happened; the honest action is to
    // record whether it was attended.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(
      booking({ scheduledAt: new Date(Date.now() - 2 * HOUR_MS) })
    );
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses to cancel twice", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(booking({ status: "cancelled" }));
    expect((await DELETE(req(), PARAMS)).status).toBe(409);
  });

  it("lets a date-only request be withdrawn freely", async () => {
    // No agreed time means no notice window to be inside.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(
      booking({ status: "pending", scheduledAt: null, preferredDate: "2026-09-01" })
    );
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedValues()).toMatchObject({ lateCancellation: false });
  });

  it("sends the patient a cancellation carrying a calendar cancel", async () => {
    // An email alone leaves a ghost appointment that still buzzes on the day.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    setupUpdate([booking({ status: "cancelled", revision: 1, lateCancellation: false })]);
    await DELETE(req(), PARAMS);
    await mockRunAfterResponse.mock.calls[0][0]();
    const sent = mockSendEmail.mock.calls.map((c) => c[0]);
    const toPatient = sent.find((m) => m.to === "alice@example.com");
    expect(toPatient).toBeTruthy();
    expect(toPatient.attachments?.[0]?.content).toContain("STATUS:CANCELLED");
  });
});

// ─── Rescheduling ─────────────────────────────────────────────────────────────

describe("PATCH — moving an appointment", () => {
  it("lets a patient move their own appointment", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedValues()).toMatchObject({ scheduledAt: FREE_SLOT, status: "confirmed" });
  });

  it("bumps the calendar revision so the old entry is replaced", async () => {
    // Without this the time changes and the patient's calendar never hears
    // about it — the sequence used to come from the status, which does not move.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS);
    expect(updatedValues().revision).toBeDefined();
  });

  it("keeps the time it was moved from", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const original = booking();
    mockBookingFindFirst.mockResolvedValue(original);
    await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS);
    expect(updatedValues()).toMatchObject({ rescheduledFrom: original.scheduledAt });
  });

  it("does not let an appointment block its own move", async () => {
    // The self-collision: the booking being moved is itself a busy interval, so
    // a naive re-check refuses every reschedule.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const current = booking({ scheduledAt: FREE_SLOT });
    mockBookingFindFirst.mockResolvedValue(current);
    mockGetBusyIntervals.mockResolvedValue([
      { start: FREE_SLOT, end: new Date(FREE_SLOT.getTime() + 45 * 60_000) },
    ]);
    const res = await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS);
    expect(res.status).toBe(200);
  });

  it("refuses a time the engine does not offer", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const offGrid = new Date(FREE_SLOT.getTime() + 7 * 60_000);
    const res = await PATCH(req({ slot: offGrid.toISOString() }), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("slot_taken");
  });

  it("maps a unique-index race to 409, not a 500", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" })),
        }),
      }),
    });
    const res = await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS);
    expect(res.status).toBe(409);
  });

  it("answers 404 when moving someone else's appointment", async () => {
    mockRequireSession.mockResolvedValue(OTHER_PATIENT);
    expect((await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS)).status).toBe(404);
  });

  it("refuses to move an appointment that already started", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockBookingFindFirst.mockResolvedValue(
      booking({ scheduledAt: new Date(Date.now() - HOUR_MS) })
    );
    expect((await PATCH(req({ slot: FREE_SLOT.toISOString() }), PARAMS)).status).toBe(409);
  });
});

// ─── Status changes ───────────────────────────────────────────────────────────

describe("PATCH — recording what happened", () => {
  it("lets an admin mark an appointment attended", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(req({ status: "attended" }), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedValues()).toMatchObject({ status: "attended" });
  });

  it("does not let a patient mark their own appointment attended", async () => {
    // Whether a consultation happened is a clinical record, not a preference.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await PATCH(req({ status: "attended" }), PARAMS);
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a status that is not a status", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    expect((await PATCH(req({ status: "vaporised" }), PARAMS)).status).toBe(400);
  });

  it("records the full cancellation shape when cancelling via status", async () => {
    // The same act must not leave two different shapes of history depending on
    // which button produced it.
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    await PATCH(req({ status: "cancelled" }), PARAMS);
    expect(updatedValues()).toMatchObject({
      status: "cancelled",
      cancelledBy: "admin-1",
      lateCancellation: false,
    });
    expect(updatedValues().cancelledAt).toBeInstanceOf(Date);
  });

  it("answers 404 when the row vanished between read and write", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    setupUpdate([]);
    expect((await PATCH(req({ status: "confirmed" }), PARAMS)).status).toBe(404);
  });
});

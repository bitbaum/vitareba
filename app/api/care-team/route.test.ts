/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The patient's own "choose your doctor" endpoint.
 *
 * The behaviour under test that matters most: a clinician who has closed
 * intake refuses a NEW choice but never breaks an existing one, and the
 * roster itself never hides them — hiding a person reads as the clinic
 * disowning them.
 */

const { mockRequireSession, mockUserFindFirst, mockUserFindMany, mockCareTeamFindMany, mockCareTeamFindFirst, mockBookingFindFirst, mockInsert, mockDelete } =
  vi.hoisted(() => ({
    mockRequireSession: vi.fn(),
    mockUserFindFirst: vi.fn(),
    mockUserFindMany: vi.fn(),
    mockCareTeamFindMany: vi.fn(),
    mockCareTeamFindFirst: vi.fn(),
    mockBookingFindFirst: vi.fn(),
    mockInsert: vi.fn(),
    mockDelete: vi.fn(),
  }));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst, findMany: mockUserFindMany },
      careTeam: { findMany: mockCareTeamFindMany, findFirst: mockCareTeamFindFirst },
      bookings: { findFirst: mockBookingFindFirst },
    },
    insert: mockInsert,
    delete: mockDelete,
  },
}));

import { GET, POST, DELETE } from "./route";

const PATIENT_SESSION = { session: { user: { id: "patient-1" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };
const CLINICIAN_ID = "c2222222-2222-4222-8222-222222222222";

function req(body: unknown) {
  return new Request("https://example.com/api/care-team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function clinicianRow(accepting: boolean) {
  return {
    id: CLINICIAN_ID,
    name: "Dr Alex",
    email: "alex@example.com",
    isClinician: true,
    profile: { acceptingPatients: accepting },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReturnValue({ values: () => ({ onConflictDoNothing: vi.fn() }) });
  mockDelete.mockReturnValue({ where: vi.fn() });
});

describe("GET", () => {
  it("rejects an unauthenticated caller", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await GET()).status).toBe(401);
  });

  it("returns the roster with each clinician's accepting status, never hiding a closed one", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindMany.mockResolvedValue([clinicianRow(false)]);
    mockCareTeamFindMany.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.data.clinicians).toHaveLength(1);
    expect(body.data.clinicians[0]).toMatchObject({ id: CLINICIAN_ID, acceptingPatients: false });
  });
});

describe("POST — choosing a clinician", () => {
  it("allows choosing an accepting clinician", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue(clinicianRow(true));
    const res = await POST(req({ clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("refuses choosing a clinician who has closed intake", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue(clinicianRow(false));
    mockCareTeamFindFirst.mockResolvedValue(undefined);
    mockBookingFindFirst.mockResolvedValue(undefined);
    const res = await POST(req({ clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not accepting new patients");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("still allows re-confirming an existing care-team member who has since closed intake", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue(clinicianRow(false));
    mockCareTeamFindFirst.mockResolvedValue({ patientId: "patient-1" });
    const res = await POST(req({ clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(200);
  });

  it("always allows a clinician choosing themselves, regardless of their own status", async () => {
    mockRequireSession.mockResolvedValue({ session: { user: { id: CLINICIAN_ID } }, error: null });
    mockUserFindFirst.mockResolvedValue(clinicianRow(false));
    const res = await POST(req({ clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(200);
  });

  it("rejects a malformed request body", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(req({ clinicianId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE — always allowed", () => {
  it("removes a care-team member unconditionally, even a closed one", async () => {
    // Leaving a doctor is never gated on intake status — only CHOOSING one is.
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await DELETE(req({ clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});

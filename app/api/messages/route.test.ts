/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockFindMany,
  mockUserFindFirst,
  mockInsert,
  mockSendEmail,
  mockGetAdminEmails,
  mockRunAfterResponse,
  mockGetClinicianById,
  mockGetPrimaryClinicianId,
} = vi.hoisted(() => ({
  mockRequireSession:        vi.fn(),
  mockFindMany:              vi.fn(),
  mockUserFindFirst:         vi.fn(),
  mockInsert:                vi.fn(),
  mockSendEmail:             vi.fn(),
  mockGetAdminEmails:        vi.fn(),
  mockRunAfterResponse:      vi.fn(),
  mockGetClinicianById:      vi.fn(),
  mockGetPrimaryClinicianId: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      threads: { findMany: mockFindMany },
      users:   { findFirst: mockUserFindFirst },
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

vi.mock("@/lib/domain/care-team", () => ({
  getClinicianById: mockGetClinicianById,
  getPrimaryClinicianId: mockGetPrimaryClinicianId,
}));

import { GET, POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PATIENT_SESSION = { session: { user: { id: "patient-1", role: "patient", email: "alice@example.com" } }, error: null };
const ADMIN_SESSION   = { session: { user: { id: "admin-1",   role: "admin",   email: "admin@example.com"  } }, error: null };
const UNAUTH          = { session: null, error: new Response(null, { status: 401 }) };

const THREAD = {
  id: "thread-1",
  patientId: "patient-1",
  clinicianId: null,
  subject: "Protocol question",
  lastMessageAt: new Date("2026-05-07T00:00:00Z"),
  createdAt:     new Date("2026-05-07T00:00:00Z"),
};

const CLINICIAN_ID = "b1ffc99a-9c0b-4ef8-bb6d-6bb9bd380a22";
const CLINICIAN = { id: CLINICIAN_ID, name: "Dr Manuel Schabus", email: "manuel@vitareba.ch" };

const VALID_POST_BODY = {
  subject: "Question about my protocol",
  body:    "I wanted to ask about the dosage.",
};

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Captures the values passed to the threads insert so tests can assert what
// was actually stored on the thread row.
let threadValues: ReturnType<typeof vi.fn>;

// Sets up the two sequential inserts: threads (with .returning) then threadMessages (no .returning)
function setupInsert() {
  threadValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([THREAD]),
  });
  mockInsert
    .mockReturnValueOnce({ values: threadValues })
    .mockReturnValueOnce({
      values: vi.fn().mockResolvedValue({}),
    });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/messages", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockFindMany.mockReset();

    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockFindMany.mockResolvedValue([THREAD]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns 200 with thread list for a patient", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("thread-1");
  });

  it("returns 200 with all threads for admin (no where-clause filter)", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([THREAD, { ...THREAD, id: "thread-2", patientId: "other-patient" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
  });
});

describe("POST /api/messages", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockUserFindFirst.mockReset();
    mockSendEmail.mockReset();
    mockGetAdminEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockGetClinicianById.mockReset();
    mockGetPrimaryClinicianId.mockReset();

    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockGetAdminEmails.mockReturnValue(["admin@vitareba.ch"]);
    mockSendEmail.mockResolvedValue(undefined);
    // Default: nobody treats this patient yet → unaddressed thread
    mockGetPrimaryClinicianId.mockResolvedValue(null);
    mockGetClinicianById.mockResolvedValue(null);
    setupInsert();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when subject is missing", async () => {
    const res = await POST(makePostRequest({ body: "No subject here" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const res = await POST(makePostRequest({ subject: "Title only" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the threads insert throws", async () => {
    // Reset to clear the success queue from beforeEach, then set a failing default
    mockInsert.mockReset();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(500);
  });

  it("returns 201 and schedules admin notification when a patient opens a thread", async () => {
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("thread-1");
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("emails all admin addresses when patient notification fires", async () => {
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    await POST(makePostRequest(VALID_POST_BODY));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin@vitareba.ch"],
        subject: expect.stringContaining(VALID_POST_BODY.subject),
      })
    );
  });

  it("does not schedule a notification when no admin emails are configured", async () => {
    mockGetAdminEmails.mockReturnValue([]);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("returns 201 and schedules patient notification when admin opens a thread with explicit patientId", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const patientId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, patientId }));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("emails the patient when admin notification fires", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const patientId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    await POST(makePostRequest({ ...VALID_POST_BODY, patientId }));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining(VALID_POST_BODY.subject),
      })
    );
  });

  it("stores an explicit clinicianId on the thread", async () => {
    mockGetClinicianById.mockResolvedValue(CLINICIAN);
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(201);
    expect(mockGetClinicianById).toHaveBeenCalledWith(CLINICIAN_ID);
    expect(threadValues).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: "patient-1", clinicianId: CLINICIAN_ID })
    );
  });

  it("defaults to the patient's primary clinician when none is given", async () => {
    mockGetPrimaryClinicianId.mockResolvedValue(CLINICIAN_ID);
    mockGetClinicianById.mockResolvedValue(CLINICIAN);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    expect(mockGetPrimaryClinicianId).toHaveBeenCalledWith("patient-1");
    expect(threadValues).toHaveBeenCalledWith(
      expect.objectContaining({ clinicianId: CLINICIAN_ID })
    );
  });

  it("stores a null clinician when nobody treats the patient", async () => {
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    expect(threadValues).toHaveBeenCalledWith(expect.objectContaining({ clinicianId: null }));
  });

  it("rejects a clinicianId that is not a real clinician", async () => {
    mockGetClinicianById.mockResolvedValue(null); // unknown id, or a non-clinician user
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, clinicianId: CLINICIAN_ID }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed clinicianId before it reaches the DB", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, clinicianId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockGetClinicianById).not.toHaveBeenCalled();
  });

  it("emails the addressed clinician instead of every admin", async () => {
    mockGetClinicianById.mockResolvedValue(CLINICIAN);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    await POST(makePostRequest({ ...VALID_POST_BODY, clinicianId: CLINICIAN_ID }));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [CLINICIAN.email] })
    );
  });

  it("skips email when admin notification fires but patient has no email", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const patientId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: null });
    await POST(makePostRequest({ ...VALID_POST_BODY, patientId }));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

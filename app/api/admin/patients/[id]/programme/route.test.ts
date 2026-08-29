/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockAssignmentFindFirst,
  mockUserFindFirst,
  mockUpdate,
  mockInsert,
  mockSendEmail,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAssignmentFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockSendEmail: vi.fn(),
  // Capture only — tests invoke the callback explicitly via mock.calls to
  // avoid floating-Promise races (the route calls runAfterResponse without await).
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      programmeAssignments: { findFirst: mockAssignmentFindFirst },
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

import { GET, PATCH } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  session: { user: { id: "admin-1", role: "admin", email: "admin@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const ASSIGNMENT = {
  id: "assign-1",
  patientId: "patient-1",
  programme: "edge_diagnostic",
  phase: "intake",
  startDate: null,
  notes: null,
  assignedBy: "admin-1",
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
  updatedAt: new Date("2026-05-07T00:00:00.000Z"),
};

const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_PATIENT_ID }) };

const VALID_PATCH = {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ programme: "edge_diagnostic", phase: "intake" }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupUpdate(returning: object[]) {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returning),
      }),
    }),
  });
}

function setupInsert(returning: object[]) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returning),
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/admin/patients/[id]/programme", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockAssignmentFindFirst.mockReset();
  });

  it("returns 401 when caller is not admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB query throws", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns the programme assignment when one exists", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockResolvedValue(ASSIGNMENT);
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.programme).toBe("edge_diagnostic");
  });

  it("returns null when no assignment exists", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockResolvedValue(undefined);
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toBeNull();
  });
});

describe("PATCH /api/admin/patients/[id]/programme", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockAssignmentFindFirst.mockReset();
    mockUserFindFirst.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockSendEmail.mockReset();
    mockRunAfterResponse.mockReset();
    mockSendEmail.mockResolvedValue(undefined);
    setupUpdate([ASSIGNMENT]);
    setupInsert([ASSIGNMENT]);
  });

  it("returns 401 when caller is not admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PATCH(new Request("https://example.com", VALID_PATCH), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid programme value", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(
      new Request("https://example.com", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programme: "invalid_programme", phase: "intake" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB operation throws", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockRejectedValue(new Error("db down"));
    const res = await PATCH(new Request("https://example.com", VALID_PATCH), PARAMS);
    expect(res.status).toBe(500);
  });

  it("updates existing assignment without scheduling a notification email", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockResolvedValue(ASSIGNMENT); // existing → update path
    setupUpdate([{ ...ASSIGNMENT, phase: "active" }]);

    const res = await PATCH(
      new Request("https://example.com", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programme: "edge_diagnostic", phase: "active" }),
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("creates new assignment and schedules patient enrolment email", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockResolvedValue(null); // no existing → insert path
    setupInsert([ASSIGNMENT]);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });

    const res = await PATCH(new Request("https://example.com", VALID_PATCH), PARAMS);
    expect(res.status).toBe(200);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("Edge Diagnostic"),
      }),
    );
  });

  it("skips enrolment email when patient has no email address", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockAssignmentFindFirst.mockResolvedValue(null);
    setupInsert([ASSIGNMENT]);
    mockUserFindFirst.mockResolvedValue(null); // patient not found

    const res = await PATCH(new Request("https://example.com", VALID_PATCH), PARAMS);
    expect(res.status).toBe(200);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

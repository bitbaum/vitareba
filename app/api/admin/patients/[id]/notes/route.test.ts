/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockFindMany, mockUserFindFirst, mockInsert } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      patientNotes: { findMany: mockFindMany },
      users: { findFirst: mockUserFindFirst },
    },
    insert: mockInsert,
  },
}));

import { GET, POST } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const NOTE = {
  id: "note-1",
  patientId: "patient-1",
  adminId: "admin-1",
  body: "Patient is progressing well.",
  admin: { name: "Manuel" },
};
const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_PATIENT_ID }) };

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/admin/patients/patient-1/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupInsert(result = NOTE) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([result]),
    }),
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/admin/patients/[id]/notes", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockFindMany.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([NOTE]);
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 500 when DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 200 with notes for the patient", async () => {
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data[0].id).toBe("note-1");
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/admin/patients/[id]/notes", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockInsert.mockReset();
    mockUserFindFirst.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockUserFindFirst.mockResolvedValue({ name: "Manuel" });
    setupInsert();
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeRequest({ body: "Note text" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the note body is empty", async () => {
    const res = await POST(makeRequest({ body: "" }), PARAMS); // min(1) fails
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(makeRequest({ body: "Note text" }), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 201 with the note and admin name", async () => {
    const res = await POST(makeRequest({ body: "Patient is progressing well." }), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("note-1");
    expect(json.data.admin.name).toBe("Manuel");
  });

  it("returns 201 with null admin name when user lookup fails", async () => {
    mockUserFindFirst.mockRejectedValue(new Error("db down")); // swallowed by .catch(() => null)
    const res = await POST(makeRequest({ body: "Note text" }), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.admin.name).toBeNull();
  });
});

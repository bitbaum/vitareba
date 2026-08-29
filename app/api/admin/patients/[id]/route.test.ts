/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockFindFirst } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: { query: { users: { findFirst: mockFindFirst } } },
}));

import { GET } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const PATIENT = {
  id: "patient-1",
  name: "Alice",
  email: "alice@example.com",
  role: "patient",
  profile: null,
  assessmentResults: [],
  bookings: [],
  documents: [],
  threads: [],
};

const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_PATIENT_ID }) };

describe("GET /api/admin/patients/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockFindFirst.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindFirst.mockResolvedValue(PATIENT);
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(new Request("https://example.com/api/admin/patients/patient-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB throws", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("https://example.com/api/admin/patients/patient-1"), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 404 when the patient does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await GET(new Request("https://example.com/api/admin/patients/patient-1"), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 200 with full patient data", async () => {
    const res = await GET(new Request("https://example.com/api/admin/patients/patient-1"), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("patient-1");
    expect(json.data.name).toBe("Alice");
  });
});

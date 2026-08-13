/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockFindMany } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFindMany:     vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findMany: mockFindMany } },
    // The care-team inclusion builds an inArray subquery — never executed
    // here because findMany itself is mocked, it just has to construct.
    select: () => ({ from: () => ({}) }),
  },
}));

import { GET } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH        = { session: null, error: new Response(null, { status: 401 }) };

const PATIENT = {
  id: "patient-1", name: "Alice", email: "alice@example.com", role: "patient",
  profile: null, assessmentResults: [],
};

describe("GET /api/admin/patients", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockFindMany.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([PATIENT]);
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns 200 with the patient list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("patient-1");
  });

  it("returns 200 with an empty array when no patients exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });
});

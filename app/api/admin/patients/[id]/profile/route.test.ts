/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockUpdate, mockInsert } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    update: mockUpdate,
    insert: mockInsert,
  },
}));

import { PATCH } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_PATIENT_ID }) };

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/admin/patients/patient-1/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Profiles use insert+onConflictDoUpdate (upsert), not a plain update
function setupUpsert() {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue({}),
    }),
  });
}

function setupUserUpdate() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });
}

describe("PATCH /api/admin/patients/[id]/profile", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    setupUpsert();
    setupUserUpdate();
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PATCH(makeRequest({ city: "Zürich" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the request body is invalid", async () => {
    // sleepHoursAvg must be an integer — string fails
    const res = await PATCH(makeRequest({ sleepHoursAvg: "eight" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB throws", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await PATCH(makeRequest({ city: "Zürich" }), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 200 on success (profile fields only, no name)", async () => {
    const res = await PATCH(makeRequest({ city: "Zürich", occupation: "Engineer" }), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // No name → users update should NOT be called
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("also updates the users table when a name is provided", async () => {
    const res = await PATCH(makeRequest({ name: "Alice B.", city: "Zürich" }), PARAMS);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

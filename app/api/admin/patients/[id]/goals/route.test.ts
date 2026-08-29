/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockFindMany, mockInsert } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFindMany: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { clinicalGoals: { findMany: mockFindMany } },
    insert: mockInsert,
  },
}));

import { GET, POST } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const GOAL = {
  id: "goal-1",
  patientId: "patient-1",
  title: "Improve focus",
  baseline: 40,
  current: 55,
  target: 80,
};
const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ id: VALID_PATIENT_ID }) };

const VALID_BODY = { title: "Improve sleep quality" };

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/admin/patients/patient-1/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupInsert(result = GOAL) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([result]),
    }),
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/admin/patients/[id]/goals", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockFindMany.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([GOAL]);
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

  it("returns 200 with goals for the patient", async () => {
    const res = await GET(new Request("https://example.com"), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data[0].id).toBe("goal-1");
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/admin/patients/[id]/goals", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockInsert.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    setupInsert();
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the request body is invalid", async () => {
    const res = await POST(makeRequest({ title: "" }), PARAMS); // min(1) fails
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(makeRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 201 with the created goal", async () => {
    const res = await POST(makeRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("goal-1");
  });
});

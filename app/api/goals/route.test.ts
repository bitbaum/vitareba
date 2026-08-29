/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSession, mockFindMany } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: { query: { clinicalGoals: { findMany: mockFindMany } } },
}));

import { GET } from "./route";

const PATIENT_SESSION = { session: { user: { id: "patient-1", role: "patient" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const GOAL = {
  id: "goal-1",
  patientId: "patient-1",
  title: "Improve focus",
  baseline: 40,
  current: 55,
  target: 80,
};

describe("GET /api/goals", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockFindMany.mockReset();
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockFindMany.mockResolvedValue([GOAL]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns 200 with the patient's goal list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("goal-1");
  });

  it("returns 200 with an empty array when no goals exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });
});

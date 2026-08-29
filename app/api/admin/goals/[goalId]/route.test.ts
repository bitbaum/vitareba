/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    update: mockUpdate,
    delete: mockDelete,
  },
}));

import { PATCH, DELETE } from "./route";

const ADMIN_SESSION = { session: { user: { id: "admin-1", role: "admin" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const GOAL = {
  id: "goal-1",
  patientId: "patient-1",
  title: "Improve focus",
  baseline: 40,
  current: 60,
  target: 80,
};
const VALID_GOAL_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ goalId: VALID_GOAL_ID }) };

function makeRequest(method: string, body: unknown) {
  return new Request("https://example.com/api/admin/goals/goal-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// PATCH uses update().set().where().returning()
// Pass null to simulate a row that does not exist (empty returning array).
function setupUpdate(result: typeof GOAL | null = GOAL) {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result !== null ? [result] : []),
      }),
    }),
  });
}

function setupDelete() {
  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue({}),
  });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/goals/[goalId]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUpdate.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    setupUpdate();
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PATCH(makeRequest("PATCH", { title: "New title" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the request body is invalid", async () => {
    // baseline must be 0–100 integer
    const res = await PATCH(makeRequest("PATCH", { baseline: 200 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB update throws", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("db down")),
        }),
      }),
    });
    const res = await PATCH(makeRequest("PATCH", { title: "New title" }), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 404 when the goal does not exist (empty returning)", async () => {
    setupUpdate(null);
    const res = await PATCH(makeRequest("PATCH", { title: "New title" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 200 with the updated goal", async () => {
    const res = await PATCH(makeRequest("PATCH", { current: 65, completed: false }), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("goal-1");
  });

  it("sets completedAt when completed: true is passed", async () => {
    await PATCH(makeRequest("PATCH", { completed: true }), PARAMS);
    const setCall = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.completedAt).toBeInstanceOf(Date);
  });

  it("clears completedAt when completed: false is passed", async () => {
    await PATCH(makeRequest("PATCH", { completed: false }), PARAMS);
    const setCall = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.completedAt).toBeNull();
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/goals/[goalId]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDelete.mockReset();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    setupDelete();
  });

  it("returns 401 when caller is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await DELETE(new Request("https://example.com/api/admin/goals/goal-1"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB delete throws", async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await DELETE(new Request("https://example.com/api/admin/goals/goal-1"), PARAMS);
    expect(res.status).toBe(500);
  });

  it("returns 200 on successful deletion", async () => {
    const res = await DELETE(new Request("https://example.com/api/admin/goals/goal-1"), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

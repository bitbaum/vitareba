/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSession, mockUpdate } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: { update: mockUpdate },
}));

import { POST } from "./route";

const SESSION = { session: { user: { id: "user-1", role: "patient" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const VALID_LEAD_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/assessment-leads/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupUpdate() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });
}

describe("POST /api/assessment-leads/convert", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockUpdate.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
    setupUpdate();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(makeRequest({ leadId: VALID_LEAD_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const res = await POST(
      new Request("https://example.com/api/assessment-leads/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when leadId is not a valid UUID", async () => {
    const res = await POST(makeRequest({ leadId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 on success", async () => {
    const res = await POST(makeRequest({ leadId: VALID_LEAD_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 200 even when the DB update throws (non-critical, error is swallowed)", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(makeRequest({ leadId: VALID_LEAD_ID }));
    expect(res.status).toBe(200);
  });
});

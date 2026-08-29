/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: mockInsert },
}));

import { POST } from "./route";

const LEAD = { id: "lead-1", overallScore: 72 };

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/assessment-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assessment-leads", () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([LEAD]),
      }),
    });
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(
      new Request("https://example.com/api/assessment-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ not valid json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when overallScore is out of the valid range", async () => {
    const res = await POST(makeRequest({ overallScore: 150 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when overallScore is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(makeRequest({ overallScore: 72 }));
    expect(res.status).toBe(500);
  });

  it("returns 201 with the lead id on success", async () => {
    const res = await POST(makeRequest({ overallScore: 72 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("lead-1");
  });
});

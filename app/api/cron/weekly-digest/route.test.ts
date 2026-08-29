/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCron, mockRunCronWeeklyDigest } = vi.hoisted(() => ({
  mockRequireCron: vi.fn(),
  mockRunCronWeeklyDigest: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCron: mockRequireCron }));
vi.mock("@/lib/workflows/cron-weekly-digest", () => ({
  runCronWeeklyDigest: mockRunCronWeeklyDigest,
}));

import { GET } from "./route";

const CRON_REQUEST = new Request("https://example.com/api/cron/weekly-digest", {
  headers: { Authorization: "Bearer test-secret" },
});

describe("GET /api/cron/weekly-digest", () => {
  beforeEach(() => {
    mockRequireCron.mockReset();
    mockRunCronWeeklyDigest.mockReset();
    mockRequireCron.mockReturnValue(null);
    mockRunCronWeeklyDigest.mockResolvedValue({ success: true, sent: 4, skipped: 2 });
  });

  it("returns 401 when the cron secret is invalid", async () => {
    mockRequireCron.mockReturnValue(new Response(null, { status: 401 }));
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the workflow signals a DB failure", async () => {
    mockRunCronWeeklyDigest.mockResolvedValue({ success: false, error: "Database unavailable" });
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(500);
  });

  it("returns 200 with sent/skipped counts on success", async () => {
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sent).toBe(4);
    expect(json.skipped).toBe(2);
  });
});

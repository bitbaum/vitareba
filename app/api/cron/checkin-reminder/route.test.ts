/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCron, mockRunCronCheckinReminder } = vi.hoisted(() => ({
  mockRequireCron: vi.fn(),
  mockRunCronCheckinReminder: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCron: mockRequireCron }));

vi.mock("@/lib/workflows/cron-checkin-reminder", () => ({
  runCronCheckinReminder: mockRunCronCheckinReminder,
}));

import { GET } from "./route";

const CRON_REQUEST = new Request("https://example.com/api/cron/checkin-reminder", {
  headers: { Authorization: "Bearer test-secret" },
});

describe("GET /api/cron/checkin-reminder", () => {
  beforeEach(() => {
    mockRequireCron.mockReset();
    mockRunCronCheckinReminder.mockReset();
    mockRequireCron.mockReturnValue(null); // auth passes
    mockRunCronCheckinReminder.mockResolvedValue({ success: true, sent: 3, skipped: 1 });
  });

  it("returns 401 when the cron secret is missing or wrong", async () => {
    mockRequireCron.mockReturnValue(new Response(null, { status: 401 }));
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the workflow signals a DB failure", async () => {
    mockRunCronCheckinReminder.mockResolvedValue({ success: false, error: "Database unavailable" });
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(500);
  });

  it("returns 200 with sent/skipped counts on success", async () => {
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sent).toBe(3);
    expect(json.skipped).toBe(1);
  });
});

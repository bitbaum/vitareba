/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCron, mockRunCronEmails } = vi.hoisted(() => ({
  mockRequireCron: vi.fn(),
  mockRunCronEmails: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCron: mockRequireCron }));
vi.mock("@/lib/workflows/cron-emails", () => ({ runCronEmails: mockRunCronEmails }));

import { GET } from "./route";

const CRON_REQUEST = new Request("https://example.com/api/cron/emails", {
  headers: { Authorization: "Bearer test-secret" },
});

describe("GET /api/cron/emails", () => {
  beforeEach(() => {
    mockRequireCron.mockReset();
    mockRunCronEmails.mockReset();
    mockRequireCron.mockReturnValue(null);
    mockRunCronEmails.mockResolvedValue({ success: true, sent: 5, failed: 0, processed: 5 });
  });

  it("returns 401 when the cron secret is invalid", async () => {
    mockRequireCron.mockReturnValue(new Response(null, { status: 401 }));
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the workflow signals a DB failure", async () => {
    mockRunCronEmails.mockResolvedValue({ success: false, error: "Database unavailable" });
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(500);
  });

  it("returns 200 with processing counts on success", async () => {
    const res = await GET(CRON_REQUEST);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sent).toBe(5);
    expect(json.processed).toBe(5);
  });
});

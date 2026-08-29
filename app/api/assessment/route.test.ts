/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockAssessmentFindFirst,
  mockAssessmentFindMany,
  mockInsert,
  mockEnqueueAssessmentEmails,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockAssessmentFindFirst: vi.fn(),
  mockAssessmentFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockEnqueueAssessmentEmails: vi.fn(),
  // Capture only — tests invoke the callback explicitly via mock.calls to
  // avoid floating-Promise races (the route calls runAfterResponse without await).
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      assessmentResults: {
        findFirst: mockAssessmentFindFirst,
        findMany: mockAssessmentFindMany,
      },
    },
    insert: mockInsert,
  },
}));

vi.mock("@/lib/domain/email-queue", () => ({
  enqueueAssessmentEmails: mockEnqueueAssessmentEmails,
}));

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET, POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = {
  session: { user: { id: "user-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

// All 5 dimension keys required by assessmentScoresSchema
const VALID_SCORES = {
  arousal: 75,
  divergent: 60,
  hyperfocus: 80,
  volatility: 45,
  environment: 70,
};

const RESULT = {
  id: "result-1",
  userId: "user-1",
  scores: VALID_SCORES,
  overallScore: 66,
  completedAt: new Date("2026-05-07T09:00:00.000Z"),
};

const VALID_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scores: VALID_SCORES, overallScore: 66 }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupInsert(returning: object[]) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returning),
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/assessment", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockAssessmentFindMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the DB query throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockAssessmentFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns the assessment history for the authenticated user", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockAssessmentFindMany.mockResolvedValue([RESULT]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
  });
});

describe("POST /api/assessment", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockAssessmentFindFirst.mockReset();
    mockInsert.mockReset();
    mockEnqueueAssessmentEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockEnqueueAssessmentEmails.mockResolvedValue(undefined);
    mockAssessmentFindFirst.mockResolvedValue(null); // default: first assessment
    setupInsert([RESULT]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(new Request("https://example.com/api/assessment", VALID_POST));
    expect(res.status).toBe(401);
  });

  it("returns 400 when overallScore is out of range", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      new Request("https://example.com/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: VALID_SCORES, overallScore: 150 }), // > 100
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a dimension key is missing from scores", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { arousal, ...missingDimension } = VALID_SCORES;
    const res = await POST(
      new Request("https://example.com/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: missingDimension, overallScore: 66 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(new Request("https://example.com/api/assessment", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("queues emails with isFirstAssessment=true when no prior result exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockAssessmentFindFirst.mockResolvedValue(null); // no prior

    const res = await POST(new Request("https://example.com/api/assessment", VALID_POST));
    expect(res.status).toBe(201);
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockEnqueueAssessmentEmails).toHaveBeenCalledWith(
      expect.objectContaining({ isFirstAssessment: true, userId: "user-1", overallScore: 66 }),
    );
  });

  it("queues emails with isFirstAssessment=false on a retake", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockAssessmentFindFirst.mockResolvedValue({ id: "prior-1" }); // prior exists

    const res = await POST(new Request("https://example.com/api/assessment", VALID_POST));
    expect(res.status).toBe(201);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockEnqueueAssessmentEmails).toHaveBeenCalledWith(
      expect.objectContaining({ isFirstAssessment: false }),
    );
  });

  it("defaults to isFirstAssessment=true when the prior-check DB call fails", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Non-fatal: the route catches this and defaults priorCount to 0
    mockAssessmentFindFirst.mockRejectedValue(new Error("db blip"));

    const res = await POST(new Request("https://example.com/api/assessment", VALID_POST));
    expect(res.status).toBe(201);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockEnqueueAssessmentEmails).toHaveBeenCalledWith(
      expect.objectContaining({ isFirstAssessment: true }),
    );
  });
});

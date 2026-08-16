/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP behaviour of the thread endpoint.
 *
 * Authorization itself is tested in lib/domain/messages.test.ts (wiring) and in
 * threadkit (the rules). What matters here is that the route asks the domain
 * layer instead of deciding for itself, and that it does not leak the existence
 * of a thread it just refused.
 */

const {
  mockRequireSession,
  mockGetThreadForActor,
  mockMarkThreadRead,
  mockPostMessage,
  mockSerializeThread,
  mockNotify,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockGetThreadForActor: vi.fn(),
  mockMarkThreadRead: vi.fn(),
  mockPostMessage: vi.fn(),
  mockSerializeThread: vi.fn(),
  mockNotify: vi.fn(),
  // Capture only — the route does not await it, so tests invoke the callback
  // explicitly to avoid floating-Promise races.
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

// Spread the real module so `replySchema` stays the real schema. A mock that
// restates validation is a second source of truth, and it always drifts.
vi.mock("@/lib/domain/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain/messages")>()),
  getThreadForActor: mockGetThreadForActor,
  markThreadRead: mockMarkThreadRead,
  postMessage: mockPostMessage,
}));

vi.mock("@/lib/db", () => ({ db: { query: {} } }));
vi.mock("@/lib/domain/messages-view", () => ({ serializeThread: mockSerializeThread }));
vi.mock("@/lib/domain/message-notifications", () => ({
  notifyThreadParticipants: mockNotify,
}));
vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET, POST } from "./route";

const PATIENT_SESSION = {
  session: { user: { id: "patient-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const VALID_THREAD_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const PARAMS = { params: Promise.resolve({ threadId: VALID_THREAD_ID }) };
const url = `https://portal.example.com/api/messages/${VALID_THREAD_ID}`;

const LOADED = {
  thread: { id: VALID_THREAD_ID, participants: [], createdAt: new Date() },
  messages: [],
  row: { patientId: "patient-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(PATIENT_SESSION);
  mockSerializeThread.mockResolvedValue({ id: VALID_THREAD_ID, messages: [] });
});

describe("GET /api/messages/[threadId]", () => {
  it("refuses an unauthenticated request", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET(new Request(url), PARAMS);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed thread id before touching the database", async () => {
    const res = await GET(new Request(url), {
      params: Promise.resolve({ threadId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    expect(mockGetThreadForActor).not.toHaveBeenCalled();
  });

  it("answers 404 — not 403 — for a thread the caller is not in", async () => {
    // A 403 would confirm the thread exists, and on a clinical system the
    // existence of a particular conversation is itself a disclosure.
    mockGetThreadForActor.mockResolvedValue(null);
    const res = await GET(new Request(url), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns the thread and schedules a read mark for this actor only", async () => {
    mockGetThreadForActor.mockResolvedValue(LOADED);
    const res = await GET(new Request(url), PARAMS);

    expect(res.status).toBe(200);
    expect(mockGetThreadForActor).toHaveBeenCalledWith(VALID_THREAD_ID, "patient-1");

    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockMarkThreadRead).toHaveBeenCalledWith(VALID_THREAD_ID, "patient-1");
  });

  it("does not mark anything read when the thread was refused", async () => {
    mockGetThreadForActor.mockResolvedValue(null);
    await GET(new Request(url), PARAMS);
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });
});

describe("POST /api/messages/[threadId]", () => {
  const send = (body: unknown) =>
    POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      PARAMS
    );

  it("refuses an unauthenticated request", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await send({ body: "hi" })).status).toBe(401);
  });

  it("rejects an empty body", async () => {
    const res = await send({ body: "" });
    expect(res.status).toBe(400);
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("stores the message and schedules notification for everyone else", async () => {
    mockPostMessage.mockResolvedValue({ ok: true, message: { id: "msg-1" } });
    const res = await send({ body: "Hello" });

    expect(res.status).toBe(201);
    expect(mockPostMessage).toHaveBeenCalledWith({
      threadId: VALID_THREAD_ID,
      actorId: "patient-1",
      body: "Hello",
      senderId: "patient-1",
    });

    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockNotify).toHaveBeenCalledWith(VALID_THREAD_ID, "patient-1");
  });

  it("answers 404 when the sender may not write here", async () => {
    // Covers a non-participant, someone who has left, and a muted observer —
    // all indistinguishable from outside, on purpose.
    mockPostMessage.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await send({ body: "Hello" });

    expect(res.status).toBe(404);
    expect(mockRunAfterResponse).not.toHaveBeenCalled();
  });

  it("does not notify anyone when the write failed", async () => {
    mockPostMessage.mockResolvedValue({ ok: false, reason: "not-found" });
    await send({ body: "Hello" });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP behaviour of the assistant endpoint.
 *
 * Whether the assistant may speak at all is decided in
 * lib/domain/thread-assistant.ts and tested there. What matters here is that the
 * route reports that decision faithfully — in particular that `consentIsYours`
 * survives the trip, because the UI uses it to decide whether to offer an
 * "I consent" button, and a dropped field would silently offer it to everyone.
 */

const { mockRequireSession, mockGetThreadForActor, mockRunThreadAssistant, mockIsAiDpaSigned } =
  vi.hoisted(() => ({
    mockRequireSession: vi.fn(),
    mockGetThreadForActor: vi.fn(),
    mockRunThreadAssistant: vi.fn(),
    mockIsAiDpaSigned: vi.fn(),
  }));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/ai", () => ({ isAiDpaSigned: mockIsAiDpaSigned }));
vi.mock("@/lib/db", () => ({ db: { query: {} } }));
vi.mock("@/lib/domain/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain/messages")>()),
  getThreadForActor: mockGetThreadForActor,
}));
vi.mock("@/lib/domain/thread-assistant", () => ({
  runThreadAssistant: mockRunThreadAssistant,
}));

import { POST } from "./route";

const THREAD = "11111111-1111-4111-8111-111111111111";
const params = (threadId = THREAD) => ({ params: Promise.resolve({ threadId }) });
const req = () => new Request("http://localhost/api/messages/x/assistant", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({ session: { user: { id: "patient-1" } } });
  mockGetThreadForActor.mockResolvedValue({ id: THREAD });
  mockIsAiDpaSigned.mockReturnValue(true);
});

describe("POST /api/messages/[threadId]/assistant", () => {
  it("passes consentIsYours through on a 451 so the UI can offer consent", async () => {
    mockRunThreadAssistant.mockResolvedValue({
      status: "blocked",
      code: "no_consent",
      consentIsYours: true,
    });

    const res = await POST(req(), params());
    expect(res.status).toBe(451);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: "no_consent",
      blockId: "cloud-ai-processing",
      consentIsYours: true,
    });
  });

  it("reports consentIsYours: false when the consent belongs to someone else", async () => {
    mockRunThreadAssistant.mockResolvedValue({
      status: "blocked",
      code: "no_consent",
      consentIsYours: false,
    });

    const res = await POST(req(), params());
    const body = await res.json();
    expect(res.status).toBe(451);
    // Present and false — not absent. `data.consentIsYours` being undefined
    // would be falsy too, so an omitted field would pass a laxer assertion
    // while breaking nothing visible until someone reads it as "unknown".
    expect(body).toHaveProperty("consentIsYours", false);
  });

  it("does not invent a consent flag when no provider is configured", async () => {
    mockRunThreadAssistant.mockResolvedValue({ status: "blocked", code: "ai_not_configured" });

    const res = await POST(req(), params());
    const body = await res.json();
    expect(res.status).toBe(451);
    expect(body.code).toBe("ai_not_configured");
    expect(body).not.toHaveProperty("consentIsYours");
  });

  it("refuses a thread the caller cannot see, without confirming it exists", async () => {
    mockGetThreadForActor.mockResolvedValue(null);

    const res = await POST(req(), params());
    expect(res.status).toBe(404);
    // Never reaches the model: a non-participant must not be able to make the
    // assistant read a thread on their behalf.
    expect(mockRunThreadAssistant).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID thread id before touching the database", async () => {
    const res = await POST(req(), params("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockGetThreadForActor).not.toHaveBeenCalled();
  });

  it("flags an unsigned DPA on a successful post, rather than blocking it", async () => {
    mockIsAiDpaSigned.mockReturnValue(false);
    mockRunThreadAssistant.mockResolvedValue({ status: "posted", body: "Here you go." });

    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: { posted: true, dpaWarning: true },
    });
  });

  it("treats the assistant declining as success, not failure", async () => {
    mockRunThreadAssistant.mockResolvedValue({ status: "skipped", reason: "empty-response" });

    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: { posted: false, reason: "empty-response" },
    });
  });
});

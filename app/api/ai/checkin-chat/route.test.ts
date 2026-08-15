/// <reference types="vitest/globals" />
/**
 * The post-check-in conversation is an AI surface over health data, so the
 * legal gate is the part worth pinning: no provider or no consent must be a
 * 451 carrying a blockId into the regulatory ledger, never a silent send.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockProfileFindFirst,
  mockAiChat,
  mockIsAiConfigured,
  mockIsAiDpaSigned,
  mockCompileDigest,
  mockClinicianLabelFor,
} = vi.hoisted(() => ({
  mockRequireSession:     vi.fn(),
  mockProfileFindFirst:   vi.fn(),
  mockAiChat:             vi.fn(),
  mockIsAiConfigured:     vi.fn(),
  mockIsAiDpaSigned:      vi.fn(),
  mockCompileDigest:      vi.fn(),
  mockClinicianLabelFor:  vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: { query: { profiles: { findFirst: mockProfileFindFirst } } },
}));

vi.mock("@/lib/ai", () => ({
  aiChat: mockAiChat,
  isAiConfigured: mockIsAiConfigured,
  isAiDpaSigned: mockIsAiDpaSigned,
}));

vi.mock("@/lib/domain/ai-brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/ai-brief")>();
  return { ...actual, compilePatientDigest: mockCompileDigest };
});

vi.mock("@/lib/domain/clinician-label", () => ({ clinicianLabelFor: mockClinicianLabelFor }));

import { POST } from "./route";
import { CHECKIN_CHAT_MAX_TURNS } from "@/lib/config/portal";

const SESSION = { session: { user: { id: "patient-1", role: "patient" } }, error: null };
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const ASK = { messages: [{ role: "user", content: "Why is my focus dipping?" }] };

function post(body: unknown) {
  return POST(
    new Request("https://example.com/api/ai/checkin-chat", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/ai/checkin-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(SESSION);
    mockIsAiConfigured.mockReturnValue(true);
    mockIsAiDpaSigned.mockReturnValue(true);
    mockProfileFindFirst.mockResolvedValue({ aiConsentAt: new Date("2026-05-01") });
    mockCompileDigest.mockResolvedValue("Patient: Alice\nCheck-ins: …");
    mockClinicianLabelFor.mockResolvedValue("Dr Example");
    mockAiChat.mockResolvedValue({ ok: true, text: "Your focus dipped on the two nights you slept least." });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await post(ASK)).status).toBe(401);
  });

  it("returns 451 with a blockId when no AI provider is configured", async () => {
    mockIsAiConfigured.mockReturnValue(false);
    const res = await post(ASK);
    expect(res.status).toBe(451);
    const json = await res.json();
    expect(json).toMatchObject({ code: "ai_not_configured", blockId: "cloud-ai-processing" });
    expect(mockAiChat).not.toHaveBeenCalled();
  });

  it("returns 451 and sends nothing when the patient has not consented", async () => {
    mockProfileFindFirst.mockResolvedValue({ aiConsentAt: null });
    const res = await post(ASK);
    expect(res.status).toBe(451);
    const json = await res.json();
    expect(json).toMatchObject({ code: "no_consent", blockId: "cloud-ai-processing" });
    expect(mockAiChat).not.toHaveBeenCalled();
  });

  it("rejects an empty conversation", async () => {
    expect((await post({ messages: [] })).status).toBe(400);
  });

  it("rejects a conversation whose last turn is not the patient's", async () => {
    const res = await post({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });
    expect(res.status).toBe(400);
    expect(mockAiChat).not.toHaveBeenCalled();
  });

  it("rejects a conversation longer than the turn cap", async () => {
    const messages = Array.from({ length: CHECKIN_CHAT_MAX_TURNS + 1 }, () => ({
      role: "user",
      content: "again",
    }));
    expect((await post({ messages })).status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("https://example.com/api/ai/checkin-chat", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
  });

  it("passes the conversation through verbatim and returns the reply", async () => {
    const messages = [
      { role: "user", content: "Why is my focus dipping?" },
      { role: "assistant", content: "Sleep is the pattern." },
      { role: "user", content: "What should I try this week?" },
    ];
    const res = await post({ messages });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.reply).toContain("focus dipped");
    expect(data.dpaWarning).toBe(false);
    expect(mockAiChat).toHaveBeenCalledWith(
      expect.objectContaining({ history: messages })
    );
    // The system prompt carries the patient's own digest — the model answers
    // from tracked data, not from the question alone.
    expect(mockAiChat.mock.calls[0][0].system).toContain("Patient: Alice");
  });

  it("flags a provider without a signed DPA", async () => {
    mockIsAiDpaSigned.mockReturnValue(false);
    const { data } = await (await post(ASK)).json();
    expect(data.dpaWarning).toBe(true);
  });

  it("returns 502 when the provider fails", async () => {
    mockAiChat.mockResolvedValue({ ok: false, error: "AI provider error (500)" });
    expect((await post(ASK)).status).toBe(502);
  });

  it("returns 500 when the consent lookup throws", async () => {
    mockProfileFindFirst.mockRejectedValue(new Error("db down"));
    expect((await post(ASK)).status).toBe(500);
  });
});

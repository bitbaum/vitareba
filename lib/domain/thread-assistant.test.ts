/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The assistant in a patient thread.
 *
 * What matters here is not that a model replies — it is what the model is
 * allowed to see, who may summon it, and whose consent that depends on.
 */

const {
  mockAiChat,
  mockIsAiConfigured,
  mockProfileFindFirst,
  mockLoadThread,
  mockAddParticipant,
  mockPostMessage,
} = vi.hoisted(() => ({
  mockAiChat: vi.fn(),
  mockIsAiConfigured: vi.fn(),
  mockProfileFindFirst: vi.fn(),
  mockLoadThread: vi.fn(),
  mockAddParticipant: vi.fn(),
  mockPostMessage: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  aiChat: mockAiChat,
  isAiConfigured: mockIsAiConfigured,
  isAiDpaSigned: () => false,
}));

vi.mock("@/lib/db", () => ({
  db: { query: { profiles: { findFirst: mockProfileFindFirst } } },
}));

vi.mock("@/lib/domain/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain/messages")>()),
  loadThread: mockLoadThread,
  addParticipant: mockAddParticipant,
  postMessage: mockPostMessage,
}));

import { runThreadAssistant } from "./thread-assistant";
import { ASSISTANT_ACTOR_ID } from "@/lib/config/messages";

const T0 = new Date("2026-01-01T09:00:00Z");
const T1 = new Date("2026-01-01T10:00:00Z");
const T2 = new Date("2026-01-01T11:00:00Z");

const patient = { actorId: "patient-1", kind: "human", role: "patient", joinedAt: T0 };
const doctor = { actorId: "dr-a", kind: "human", role: "clinician", joinedAt: T0 };
const assistant = {
  actorId: ASSISTANT_ACTOR_ID,
  kind: "ai",
  role: "assistant",
  joinedAt: T2,
  visibleFrom: T2,
};

/** Depth-first search for a string in a possibly cyclic object graph. */
function containsString(value: unknown, needle: string, seen = new WeakSet()): boolean {
  if (typeof value === "string") return value === needle;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  return Object.values(value as Record<string, unknown>).some((v) =>
    containsString(v, needle, seen)
  );
}

function msg(id: string, authorId: string, createdAt: Date, body = "hello") {
  return { id, threadId: "thread-1", authorId, body, createdAt };
}

function loaded(participants: unknown[], messages: unknown[]) {
  return {
    thread: { id: "thread-1", participants, createdAt: T0, subject: "Focus" },
    messages,
    row: { id: "thread-1", patientId: "patient-1", subject: "Focus", createdAt: T0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAiConfigured.mockReturnValue(true);
  mockProfileFindFirst.mockResolvedValue({ aiConsentAt: T0 });
  mockAiChat.mockResolvedValue({ ok: true, text: "Here is a summary." });
  mockPostMessage.mockResolvedValue({ ok: true, message: { id: "m-ai" } });
});

describe("runThreadAssistant", () => {
  it("refuses when no AI provider is configured", async () => {
    mockIsAiConfigured.mockReturnValue(false);
    const r = await runThreadAssistant("thread-1", "patient-1");
    expect(r).toEqual({ status: "blocked", code: "ai_not_configured" });
    expect(mockAiChat).not.toHaveBeenCalled();
  });

  it("refuses without the patient's consent, even when the clinician asks", async () => {
    // Consent belongs to the person whose care this is. A clinician pressing the
    // button is not consent on the patient's behalf.
    mockProfileFindFirst.mockResolvedValue({ aiConsentAt: null });
    mockLoadThread.mockResolvedValue(loaded([patient, doctor], [msg("m1", "patient-1", T1)]));

    const r = await runThreadAssistant("thread-1", "dr-a");
    expect(r).toEqual({ status: "blocked", code: "no_consent" });
    expect(mockAiChat).not.toHaveBeenCalled();
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it("checks consent against the thread's patient, not the requester", async () => {
    mockLoadThread.mockResolvedValue(loaded([patient, doctor], [msg("m1", "patient-1", T1)]));
    await runThreadAssistant("thread-1", "dr-a");

    expect(mockProfileFindFirst).toHaveBeenCalled();
    // A Drizzle where-clause is a cyclic object graph, so walk it for the value
    // rather than serialising it.
    expect(containsString(mockProfileFindFirst.mock.calls[0][0], "patient-1")).toBe(true);
    expect(containsString(mockProfileFindFirst.mock.calls[0][0], "dr-a")).toBe(false);
  });

  it("will not act for someone who is not in the thread", async () => {
    mockLoadThread.mockResolvedValue(loaded([patient, doctor], [msg("m1", "patient-1", T1)]));
    const r = await runThreadAssistant("thread-1", "dr-b");
    expect(r).toEqual({ status: "not-found" });
    expect(mockAiChat).not.toHaveBeenCalled();
  });

  it("invites the assistant on first use, without granting it the backlog", async () => {
    mockLoadThread
      .mockResolvedValueOnce(loaded([patient, doctor], [msg("m1", "patient-1", T1)]))
      .mockResolvedValueOnce(
        loaded([patient, doctor, assistant], [msg("m1", "patient-1", T1)])
      );

    await runThreadAssistant("thread-1", "patient-1");

    expect(mockAddParticipant).toHaveBeenCalledTimes(1);
    const arg = mockAddParticipant.mock.calls[0][0];
    expect(arg.actorId).toBe(ASSISTANT_ACTOR_ID);
    expect(arg.kind).toBe("ai");
    // Crucially: no grantFullHistory, so visibleFrom defaults to join time.
    expect(arg.grantFullHistory).toBeUndefined();
  });

  it("does not show the model anything said before it was invited", async () => {
    // m1 predates the assistant's visibleFrom (T2); m2 does not.
    const messages = [
      msg("m1", "patient-1", T1, "something private said before the assistant existed"),
      msg("m2", "patient-1", new Date("2026-01-01T12:00:00Z"), "can you summarise this?"),
    ];
    mockLoadThread
      .mockResolvedValueOnce(loaded([patient, doctor], messages))
      .mockResolvedValueOnce(loaded([patient, doctor, assistant], messages));

    await runThreadAssistant("thread-1", "patient-1");

    expect(mockAiChat).toHaveBeenCalledTimes(1);
    const sent = mockAiChat.mock.calls[0][0].user;
    expect(sent).not.toContain("something private");
    expect(sent).toContain("can you summarise this?");
  });

  it("records the reply as AI-authored with no user account behind it", async () => {
    mockLoadThread
      .mockResolvedValueOnce(loaded([patient, doctor], [msg("m1", "patient-1", T1)]))
      .mockResolvedValueOnce(
        loaded([patient, doctor, assistant], [msg("m1", "patient-1", new Date("2026-01-01T12:00:00Z"))])
      );

    const r = await runThreadAssistant("thread-1", "patient-1");

    expect(r.status).toBe("posted");
    const posted = mockPostMessage.mock.calls[0][0];
    expect(posted.actorId).toBe(ASSISTANT_ACTOR_ID);
    expect(posted.kind).toBe("ai");
    expect(posted.senderId).toBeNull();
    expect(posted.generatedByModel).toBeTruthy();
  });

  it("never posts an empty message when the provider returns nothing", async () => {
    mockAiChat.mockResolvedValue({ ok: true, text: "   " });
    mockLoadThread
      .mockResolvedValueOnce(loaded([patient, doctor], [msg("m1", "patient-1", T1)]))
      .mockResolvedValueOnce(
        loaded([patient, doctor, assistant], [msg("m1", "patient-1", new Date("2026-01-01T12:00:00Z"))])
      );

    const r = await runThreadAssistant("thread-1", "patient-1");
    expect(r.status).toBe("skipped");
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("tells the model to defer clinical questions rather than answer them", async () => {
    mockLoadThread
      .mockResolvedValueOnce(loaded([patient, doctor], [msg("m1", "patient-1", T1)]))
      .mockResolvedValueOnce(
        loaded([patient, doctor, assistant], [msg("m1", "patient-1", new Date("2026-01-01T12:00:00Z"))])
      );

    await runThreadAssistant("thread-1", "patient-1");

    const system = mockAiChat.mock.calls[0][0].system.toLowerCase();
    expect(system).toContain("never diagnose");
    expect(system).toContain("medical advice");
    expect(system).toContain("medication");
    expect(system).toContain("emergency");
  });
});

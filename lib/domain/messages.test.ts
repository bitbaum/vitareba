/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proves vitareba wires threadkit up correctly.
 *
 * The rules themselves (who may read, what counts as unread) are threadkit's
 * and are tested there. What is tested here is the wiring — that this app reads
 * participants from the right table, maps the columns onto the right fields, and
 * actually applies the filter rather than loading a thread and forgetting to.
 */

const { mockThreadFindFirst, mockParticipantsFindMany, mockMessagesFindMany } = vi.hoisted(() => ({
  mockThreadFindFirst: vi.fn(),
  mockParticipantsFindMany: vi.fn(),
  mockMessagesFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      threads: { findFirst: mockThreadFindFirst },
      threadParticipants: { findMany: mockParticipantsFindMany },
      threadMessages: { findMany: mockMessagesFindMany },
    },
  },
}));

import { getThreadForActor } from "./messages";

const T0 = new Date("2026-01-01T09:00:00Z");
const T1 = new Date("2026-01-01T10:00:00Z");
const T2 = new Date("2026-01-01T11:00:00Z");
const T3 = new Date("2026-01-01T12:00:00Z");

const THREAD_ROW = {
  id: "thread-1",
  patientId: "patient-1",
  clinicianId: "dr-a",
  subject: "Focus concerns",
  createdAt: T0,
  lastMessageAt: T3,
};

function participant(over: Record<string, unknown>) {
  return {
    id: `p-${String(over.actorId)}`,
    threadId: "thread-1",
    actorId: "x",
    kind: "human",
    role: "clinician",
    joinedAt: T0,
    leftAt: null,
    visibleFrom: T0,
    canWrite: true,
    lastReadAt: null,
    ...over,
  };
}

function message(over: Record<string, unknown>) {
  return {
    id: "m",
    threadId: "thread-1",
    senderId: null,
    authorActorId: "patient-1",
    authorKind: "human",
    generatedByModel: null,
    body: "hello",
    readAt: null,
    createdAt: T1,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockThreadFindFirst.mockResolvedValue(THREAD_ROW);
});

describe("getThreadForActor", () => {
  it("refuses a clinician who is not in the thread, whatever their role", async () => {
    mockParticipantsFindMany.mockResolvedValue([
      participant({ actorId: "patient-1", role: "patient" }),
      participant({ actorId: "dr-a" }),
    ]);
    mockMessagesFindMany.mockResolvedValue([message({ id: "m1" })]);

    // dr-b is an admin in the same clinic. That is not a key to this thread.
    expect(await getThreadForActor("thread-1", "dr-b")).toBeNull();
  });

  it("lets a participant read it", async () => {
    mockParticipantsFindMany.mockResolvedValue([
      participant({ actorId: "patient-1", role: "patient" }),
      participant({ actorId: "dr-a" }),
    ]);
    mockMessagesFindMany.mockResolvedValue([message({ id: "m1" })]);

    const loaded = await getThreadForActor("thread-1", "dr-a");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("does not show a clinician added later what was said before they joined", async () => {
    mockParticipantsFindMany.mockResolvedValue([
      participant({ actorId: "patient-1", role: "patient" }),
      // Joined at T2, so the visibility window opens there.
      participant({ actorId: "dr-b", joinedAt: T2, visibleFrom: T2 }),
    ]);
    mockMessagesFindMany.mockResolvedValue([
      message({ id: "m1", createdAt: T1, body: "history dr-b was not granted" }),
      message({ id: "m2", createdAt: T3 }),
    ]);

    const loaded = await getThreadForActor("thread-1", "dr-b");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m2"]);
  });

  it("hands over the whole history when visible_from says so", async () => {
    mockParticipantsFindMany.mockResolvedValue([
      participant({ actorId: "dr-b", joinedAt: T2, visibleFrom: T0 }),
    ]);
    mockMessagesFindMany.mockResolvedValue([
      message({ id: "m1", createdAt: T1 }),
      message({ id: "m2", createdAt: T3 }),
    ]);

    const loaded = await getThreadForActor("thread-1", "dr-b");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("stops delivering to someone who has left, without erasing what they saw", async () => {
    mockParticipantsFindMany.mockResolvedValue([participant({ actorId: "locum", leftAt: T2 })]);
    mockMessagesFindMany.mockResolvedValue([
      message({ id: "m1", createdAt: T1 }),
      message({ id: "m2", createdAt: T3 }),
    ]);

    const loaded = await getThreadForActor("thread-1", "locum");
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("reads an AI author from author_actor_id, which has no users row", async () => {
    mockParticipantsFindMany.mockResolvedValue([
      participant({ actorId: "patient-1", role: "patient" }),
      participant({ actorId: "assistant-1", kind: "ai", role: "assistant" }),
    ]);
    mockMessagesFindMany.mockResolvedValue([
      message({
        id: "m1",
        senderId: null,
        authorActorId: "assistant-1",
        authorKind: "ai",
        generatedByModel: "claude-opus-5",
      }),
    ]);

    const loaded = await getThreadForActor("thread-1", "patient-1");
    expect(loaded?.messages[0].authorId).toBe("assistant-1");
    expect(loaded?.messages[0].generatedBy).toEqual({ model: "claude-opus-5" });
  });

  it("returns null for a thread that does not exist", async () => {
    mockThreadFindFirst.mockResolvedValue(undefined);
    mockParticipantsFindMany.mockResolvedValue([]);
    mockMessagesFindMany.mockResolvedValue([]);

    expect(await getThreadForActor("thread-1", "patient-1")).toBeNull();
  });
});

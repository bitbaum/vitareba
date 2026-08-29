/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The thread list and thread creation.
 *
 * The regression worth guarding here is the old GET, which ran `where: undefined`
 * for admins and so returned every thread in the clinic. It is now a question
 * about participation, asked once, for everybody.
 */

const {
  mockRequireSession,
  mockListThreadsForActor,
  mockSerializeThreadList,
  mockAddParticipant,
  mockPostMessage,
  mockNotify,
  mockRunAfterResponse,
  mockInsert,
  mockUsersFindMany,
  mockGetClinicianById,
  mockGetPrimaryClinicianId,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockListThreadsForActor: vi.fn(),
  mockSerializeThreadList: vi.fn(),
  mockAddParticipant: vi.fn(),
  mockPostMessage: vi.fn(),
  mockNotify: vi.fn(),
  mockRunAfterResponse: vi.fn(),
  mockInsert: vi.fn(),
  mockUsersFindMany: vi.fn(),
  mockGetClinicianById: vi.fn(),
  mockGetPrimaryClinicianId: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findMany: mockUsersFindMany } },
    insert: mockInsert,
  },
}));

vi.mock("@/lib/domain/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domain/messages")>()),
  listThreadsForActor: mockListThreadsForActor,
  addParticipant: mockAddParticipant,
  postMessage: mockPostMessage,
}));

vi.mock("@/lib/domain/messages-view", () => ({
  serializeThreadList: mockSerializeThreadList,
}));
vi.mock("@/lib/domain/message-notifications", () => ({ notifyThreadParticipants: mockNotify }));
vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));
vi.mock("@/lib/domain/care-team", () => ({
  getClinicianById: mockGetClinicianById,
  getPrimaryClinicianId: mockGetPrimaryClinicianId,
}));

import { GET, POST } from "./route";

const PATIENT_SESSION = {
  session: { user: { id: "patient-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const ADMIN_SESSION = {
  session: { user: { id: "admin-1", role: "admin", email: "admin@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const THREAD = { id: "thread-1", patientId: "patient-1", subject: "Focus concerns" };
const url = "https://portal.example.com/api/messages";

function stubInsertReturning() {
  mockInsert.mockReturnValue({
    values: () => ({ returning: async () => [THREAD] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(PATIENT_SESSION);
  mockListThreadsForActor.mockResolvedValue([]);
  mockSerializeThreadList.mockResolvedValue([]);
  mockPostMessage.mockResolvedValue({ ok: true, message: { id: "msg-1" } });
  mockGetPrimaryClinicianId.mockResolvedValue(null);
  mockUsersFindMany.mockResolvedValue([]);
  stubInsertReturning();
});

describe("GET /api/messages", () => {
  it("refuses an unauthenticated request", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await GET()).status).toBe(401);
  });

  it("asks for this actor's threads, for a patient", async () => {
    await GET();
    expect(mockListThreadsForActor).toHaveBeenCalledWith("patient-1");
  });

  it("asks the same scoped question for an admin", async () => {
    // The previous implementation branched on role and fetched every thread in
    // the clinic. There is no role branch left to get wrong.
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    await GET();
    expect(mockListThreadsForActor).toHaveBeenCalledWith("admin-1");
    expect(mockListThreadsForActor).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/messages", () => {
  const create = (body: unknown, session = PATIENT_SESSION) => {
    mockRequireSession.mockResolvedValue(session);
    return POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  };

  it("rejects a missing subject", async () => {
    const res = await create({ body: "Hello" });
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("adds the patient as a participant when a patient opens a thread", async () => {
    const res = await create({ subject: "Focus concerns", body: "Hello" });
    expect(res.status).toBe(201);

    const actors = mockAddParticipant.mock.calls.map((c) => c[0].actorId);
    expect(actors).toContain("patient-1");
  });

  it("falls back to every admin when nobody treats the patient yet", async () => {
    // The thread used to reach the whole admin mailbox in this case. If no
    // clinician became a participant, the patient would be writing into a void.
    mockUsersFindMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);

    await create({ subject: "Focus concerns", body: "Hello" });

    const actors = mockAddParticipant.mock.calls.map((c) => c[0].actorId);
    expect(actors).toContain("admin-1");
    expect(actors).toContain("admin-2");
  });

  it("adds only the named clinician when the patient has one", async () => {
    mockGetPrimaryClinicianId.mockResolvedValue("dr-a");
    mockGetClinicianById.mockResolvedValue({ id: "dr-a", name: "Dr A", email: "a@example.com" });

    await create({ subject: "Focus concerns", body: "Hello" });

    const actors = mockAddParticipant.mock.calls.map((c) => c[0].actorId);
    expect(actors).toContain("dr-a");
    expect(actors).not.toContain("admin-2");
    expect(mockUsersFindMany).not.toHaveBeenCalled();
  });

  it("makes the author a participant so they can speak in their own thread", async () => {
    // An admin opening a thread for a patient treated by a colleague would
    // otherwise be refused by the very endpoint they just called.
    mockGetPrimaryClinicianId.mockResolvedValue("dr-a");
    mockGetClinicianById.mockResolvedValue({ id: "dr-a", name: "Dr A", email: "a@example.com" });

    const OTHER_PATIENT = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const res = await create(
      { subject: "Focus", body: "Hello", patientId: OTHER_PATIENT },
      ADMIN_SESSION,
    );
    expect(res.status).toBe(201);

    const actors = mockAddParticipant.mock.calls.map((c) => c[0].actorId);
    expect(actors).toContain("admin-1");
    expect(actors).toContain(OTHER_PATIENT);
  });

  it("posts the opening message as the author", async () => {
    await create({ subject: "Focus concerns", body: "Hello" });
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "patient-1", body: "Hello" }),
    );
  });

  it("reports failure rather than leaving a thread with no message in it", async () => {
    mockPostMessage.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await create({ subject: "Focus concerns", body: "Hello" });
    expect(res.status).toBe(500);
  });

  it("schedules notification once the thread exists", async () => {
    await create({ subject: "Focus concerns", body: "Hello" });
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockNotify).toHaveBeenCalledWith("thread-1", "patient-1");
  });
});

/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockPut,
  mockInsert,
  mockValues,
  mockUserFindFirst,
  mockUserFindMany,
  mockGetCareTeamIds,
  mockSendEmail,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession:  vi.fn(),
  mockPut:             vi.fn(),
  mockInsert:          vi.fn(),
  mockValues:          vi.fn(),
  mockUserFindFirst:   vi.fn(),
  mockUserFindMany:    vi.fn(),
  mockGetCareTeamIds:  vi.fn(),
  mockSendEmail:       vi.fn(),
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/storage",      () => ({ putLocal: mockPut }));
vi.mock("@/lib/email/index",  () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));
vi.mock("@/lib/domain/care-team", () => ({ getCareTeamIds: mockGetCareTeamIds }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst, findMany: mockUserFindMany },
    },
    insert: mockInsert,
  },
}));

import { POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PATIENT_ID       = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_PATIENT_ID = "b1ffcd88-8d1a-4fa7-aa5c-5aa8ac270b22";
const ADMIN_ID         = "c2aade77-7e2b-4b96-99b4-49b79b160c33";

const ADMIN_SESSION   = { session: { user: { id: ADMIN_ID,   role: "admin"   } }, error: null };
const PATIENT_SESSION = { session: { user: { id: PATIENT_ID, role: "patient" } }, error: null };
const UNAUTH          = { session: null, error: new Response(null, { status: 401 }) };

const DOC = { id: "doc-1", userId: PATIENT_ID, title: "Lab results", fileUrl: "https://blob.example.com/file.pdf" };

function makeFile(opts: { name?: string; type?: string; sizeBytes?: number } = {}) {
  const { name = "test.pdf", type = "application/pdf", sizeBytes } = opts;
  const content = sizeBytes ? new Uint8Array(sizeBytes) : new Uint8Array([1, 2, 3]);
  return new File([content], name, { type });
}

function makeFormData(overrides: Record<string, string | File | null> = {}) {
  const form = new FormData();
  const defaults: Record<string, string | File> = {
    file:      makeFile(),
    title:     "Lab results",
    patientId: PATIENT_ID,
  };
  for (const [key, val] of Object.entries({ ...defaults, ...overrides })) {
    if (val !== null) form.append(key, val as string | File);
  }
  return form;
}

function makeRequest(form: FormData) {
  return new Request("https://example.com/api/documents/upload", { method: "POST", body: form });
}

/** The values passed to db.insert(...).values(...) on the last call. */
function insertedValues() {
  return mockValues.mock.calls[0][0];
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockPut.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockUserFindFirst.mockReset();
    mockUserFindMany.mockReset();
    mockGetCareTeamIds.mockReset();
    mockSendEmail.mockReset();
    mockRunAfterResponse.mockReset();
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockPut.mockResolvedValue({ url: "https://blob.example.com/file.pdf" });
    mockValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([DOC]) });
    mockInsert.mockReturnValue({ values: mockValues });
    mockGetCareTeamIds.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(401);
  });

  it("returns 400 when file is missing", async () => {
    const form = makeFormData({ file: null });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const form = makeFormData({ title: null });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when an admin omits patientId", async () => {
    const form = makeFormData({ patientId: null });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when patientId is not a valid UUID", async () => {
    const form = makeFormData({ patientId: "not-a-uuid" });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title exceeds the maximum length", async () => {
    const form = makeFormData({ title: "a".repeat(201) });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds the size limit", async () => {
    const oversized = makeFile({ sizeBytes: 21 * 1024 * 1024 });
    const form = makeFormData({ file: oversized });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(413);
  });

  it("returns 415 when file MIME type is not in the allowlist", async () => {
    const form = makeFormData({ file: makeFile({ type: "application/x-executable" }) });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(415);
  });

  it("returns 500 when the blob upload fails", async () => {
    mockPut.mockRejectedValue(new Error("blob service unavailable"));
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the DB insert fails", async () => {
    mockValues.mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error("db down")) });
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(500);
  });

  it("returns 201 with the document and schedules a notification", async () => {
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("doc-1");
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
  });

  // ─── Ownership: the client never decides who a document belongs to ──────────

  it("lets an admin upload for any patient", async () => {
    const res = await POST(makeRequest(makeFormData({ patientId: OTHER_PATIENT_ID })));
    expect(res.status).toBe(201);
    expect(insertedValues()).toMatchObject({ userId: OTHER_PATIENT_ID, uploadedBy: ADMIN_ID });
  });

  it("files a patient's own upload against their own id", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const form = makeFormData({ patientId: null });
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(201);
    expect(insertedValues()).toMatchObject({ userId: PATIENT_ID, uploadedBy: PATIENT_ID });
  });

  it("overrides a patientId naming another user with the caller's own id", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(makeRequest(makeFormData({ patientId: OTHER_PATIENT_ID })));
    expect(res.status).toBe(201);
    expect(insertedValues()).toMatchObject({ userId: PATIENT_ID, uploadedBy: PATIENT_ID });
    expect(insertedValues().userId).not.toBe(OTHER_PATIENT_ID);
  });

  // ─── Notification routing ───────────────────────────────────────────────────

  it("emails the patient when a clinician uploaded the document for them", async () => {
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    await POST(makeRequest(makeFormData()));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("Lab results"),
      })
    );
  });

  it("skips email when the patient has no email address", async () => {
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: null });
    await POST(makeRequest(makeFormData()));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("emails the care team — not the patient — when the patient uploaded it themselves", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    mockGetCareTeamIds.mockResolvedValue(["clinician-1"]);
    mockUserFindMany.mockResolvedValue([{ email: "doc@vitareba.ch" }]);

    await POST(makeRequest(makeFormData({ patientId: null })));
    await mockRunAfterResponse.mock.calls[0][0]();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["doc@vitareba.ch"],
        subject: expect.stringContaining("Alice"),
      })
    );
  });

  it("falls back to the admin emails when the patient has no care team", async () => {
    vi.stubEnv("ADMIN_EMAILS", "manuel@example.com");
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    mockGetCareTeamIds.mockResolvedValue([]);

    await POST(makeRequest(makeFormData({ patientId: null })));
    await mockRunAfterResponse.mock.calls[0][0]();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["manuel@example.com"] })
    );
  });
});

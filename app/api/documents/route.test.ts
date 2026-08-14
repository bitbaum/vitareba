/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockFindMany,
  mockUserFindFirst,
  mockUserFindMany,
  mockGetCareTeamIds,
  mockInsert,
  mockValues,
  mockSendEmail,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession:   vi.fn(),
  mockFindMany:         vi.fn(),
  mockUserFindFirst:    vi.fn(),
  mockUserFindMany:     vi.fn(),
  mockGetCareTeamIds:   vi.fn(),
  mockInsert:           vi.fn(),
  mockValues:           vi.fn(),
  mockSendEmail:        vi.fn(),
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireSession: mockRequireSession,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      documents: { findMany: mockFindMany },
      users:     { findFirst: mockUserFindFirst, findMany: mockUserFindMany },
    },
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

vi.mock("@/lib/domain/care-team", () => ({ getCareTeamIds: mockGetCareTeamIds }));

import { GET, POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_PATIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_PATIENT_ID = "b1ffcd88-8d1a-4fa7-aa5c-5aa8ac270b22";
const ADMIN_ID         = "c2aade77-7e2b-4b96-99b4-49b79b160c33";

const PATIENT_SESSION = { session: { user: { id: VALID_PATIENT_ID, role: "patient" } }, error: null };
const ADMIN_SESSION   = { session: { user: { id: ADMIN_ID,         role: "admin"   } }, error: null };
const UNAUTH          = { session: null, error: new Response(null, { status: 401 }) };

const DOC = { id: "doc-1", userId: VALID_PATIENT_ID, title: "Lab results", fileUrl: "https://blob.example.com/file.pdf" };

const VALID_POST_BODY = {
  userId:   VALID_PATIENT_ID,
  title:    "Lab results",
  fileUrl:  "https://blob.example.com/file.pdf",
  mimeType: "application/pdf",
};

function makeGetRequest(params?: string) {
  return new Request(`https://example.com/api/documents${params ? `?${params}` : ""}`);
}

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/documents", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockFindMany.mockReset();
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    mockFindMany.mockResolvedValue([DOC]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when patientId query param is not a valid UUID", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await GET(makeGetRequest("patientId=not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });

  it("returns 200 with all documents when admin calls with no patientId filter", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([DOC, { ...DOC, id: "doc-2", userId: "patient-2" }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
  });

  it("returns 200 filtered to a specific patient when admin passes patientId", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const res = await GET(makeGetRequest(`patientId=${VALID_PATIENT_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 200 with only the patient's own documents", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].id).toBe("doc-1");
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/documents", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockUserFindFirst.mockReset();
    mockUserFindMany.mockReset();
    mockGetCareTeamIds.mockReset();
    mockSendEmail.mockReset();
    mockRunAfterResponse.mockReset();
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockSendEmail.mockResolvedValue(undefined);
    mockGetCareTeamIds.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
    mockValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([DOC]) });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the request body is invalid", async () => {
    const res = await POST(makePostRequest({ title: "No userId or fileUrl" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the DB insert throws", async () => {
    mockValues.mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error("db down")) });
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(500);
  });

  it("lets an admin file a document against any patient", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, userId: OTHER_PATIENT_ID }));
    expect(res.status).toBe(201);
    expect(mockValues.mock.calls[0][0]).toMatchObject({
      userId: OTHER_PATIENT_ID,
      uploadedBy: ADMIN_ID,
    });
  });

  it("forces a non-admin's document onto their own record", async () => {
    mockRequireSession.mockResolvedValue(PATIENT_SESSION);
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, userId: OTHER_PATIENT_ID }));
    expect(res.status).toBe(201);
    expect(mockValues.mock.calls[0][0]).toMatchObject({
      userId: VALID_PATIENT_ID,
      uploadedBy: VALID_PATIENT_ID,
    });
  });

  it("returns 201 with the document and schedules a patient notification", async () => {
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("doc-1");
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("emails the patient when the notification callback fires", async () => {
    mockUserFindFirst.mockResolvedValue({ name: "Alice", email: "alice@example.com" });
    await POST(makePostRequest(VALID_POST_BODY));
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
    await POST(makePostRequest(VALID_POST_BODY));
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

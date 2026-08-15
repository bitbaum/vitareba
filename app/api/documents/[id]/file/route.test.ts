/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSession, mockFindFirst, mockReadLocal } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockFindFirst:      vi.fn(),
  mockReadLocal:      vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: { query: { documents: { findFirst: mockFindFirst } } },
}));

vi.mock("@/lib/storage", () => ({
  readLocal: mockReadLocal,
  isLocalUrl: (url: string) => url.startsWith("/uploads/"),
}));

import { GET } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_ID = "b1ffcd88-8d1a-4fa7-aa5c-5aa8ac270b22";
const ADMIN_ID = "c2aade77-7e2b-4b96-99b4-49b79b160c33";
const DOC_ID   = "d3bbef66-6f3c-4ca5-88c3-38c68c050d44";

const OWNER_SESSION = { session: { user: { id: OWNER_ID, role: "patient" } }, error: null };
const OTHER_SESSION = { session: { user: { id: OTHER_ID, role: "patient" } }, error: null };
const ADMIN_SESSION = { session: { user: { id: ADMIN_ID, role: "admin"   } }, error: null };
const UNAUTH        = { session: null, error: new Response(null, { status: 401 }) };

const LOCAL_DOC = {
  userId: OWNER_ID,
  title: "Lab results",
  fileUrl: "/uploads/documents/patient/1_labs.pdf",
  mimeType: "application/pdf",
};

const call = (id: string = DOC_ID) =>
  GET(new Request("http://localhost/api/documents/x/file"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(OWNER_SESSION);
  mockFindFirst.mockResolvedValue(LOCAL_DOC);
  mockReadLocal.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
});

describe("GET /api/documents/[id]/file", () => {
  it("streams the file to the patient it belongs to", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toContain("%PDF-1.4");
  });

  it("streams the file to an admin", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    expect((await call()).status).toBe(200);
  });

  it("rejects an unauthenticated request", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    expect((await call()).status).toBe(401);
    expect(mockReadLocal).not.toHaveBeenCalled();
  });

  // The whole point of the route: another patient must not read this file.
  it("does not serve another patient's document", async () => {
    mockRequireSession.mockResolvedValue(OTHER_SESSION);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mockReadLocal).not.toHaveBeenCalled();
  });

  // A 403 would confirm the id names a real document — that is a disclosure
  // about another patient, so an unauthorised read looks exactly like a miss.
  it("answers a forbidden document identically to a missing one", async () => {
    mockRequireSession.mockResolvedValue(OTHER_SESSION);
    const forbidden = await call();
    mockFindFirst.mockResolvedValue(undefined);
    mockRequireSession.mockResolvedValue(OWNER_SESSION);
    const missing = await call();
    expect(forbidden.status).toBe(missing.status);
    expect(await forbidden.text()).toBe(await missing.text());
  });

  it("rejects a non-uuid id without touching the database", async () => {
    const res = await call("not-a-uuid");
    expect(res.status).toBe(400);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("never lets a document body be cached or sniffed", async () => {
    const res = await call();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("redirects to an externally-linked document instead of reading disk", async () => {
    mockFindFirst.mockResolvedValue({ ...LOCAL_DOC, fileUrl: "https://lab.example.com/r.pdf" });
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://lab.example.com/r.pdf");
    expect(mockReadLocal).not.toHaveBeenCalled();
  });

  // A row can outlive its file (restore, manual cleanup). Say so rather than
  // handing back a zero-byte "download".
  it("reports a missing file as gone", async () => {
    mockReadLocal.mockRejectedValue(new Error("ENOENT"));
    expect((await call()).status).toBe(410);
  });

  it("returns 500 when the lookup fails", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));
    expect((await call()).status).toBe(500);
  });
});

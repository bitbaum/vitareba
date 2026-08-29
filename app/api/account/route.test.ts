/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUserFindFirst,
  mockInsert,
  mockHashPassword,
  mockEnqueueWelcomeEmails,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockHashPassword: vi.fn(),
  mockEnqueueWelcomeEmails: vi.fn(),
  // Capture only — tests invoke the callback explicitly via mock.calls to
  // avoid floating-Promise races (the route calls runAfterResponse without await).
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findFirst: mockUserFindFirst } },
    insert: mockInsert,
  },
}));

vi.mock("@/lib/domain/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/auth")>();
  return { ...actual, hashPassword: mockHashPassword };
});

vi.mock("@/lib/domain/email-queue", () => ({ enqueueWelcomeEmails: mockEnqueueWelcomeEmails }));

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_BODY = { email: "alice@example.com", password: "SecurePass123!" };
const VALID_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(VALID_BODY),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Account route calls db.insert twice: once for users (with .onConflictDoNothing().returning())
// and once for profiles (just .values()). Set up both chains via mockReturnValueOnce + default.
function setupInserts(usersReturning: object[]) {
  mockInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(usersReturning),
      }),
    }),
  });
  // Second call: db.insert(profiles).values({...}) — no returning needed
  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue({}),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/account", () => {
  beforeEach(() => {
    mockUserFindFirst.mockReset();
    mockInsert.mockReset();
    mockHashPassword.mockReset();
    mockEnqueueWelcomeEmails.mockReset();
    mockRunAfterResponse.mockReset();
    mockHashPassword.mockResolvedValue("$2b$12$hashedpassword");
    mockUserFindFirst.mockResolvedValue(null); // email not taken by default
    mockEnqueueWelcomeEmails.mockResolvedValue(undefined);
    // Insert mock NOT seeded here — each test that reaches the DB insert sets it up
    // explicitly so mockReturnValueOnce queues don't bleed across tests.
  });

  it("returns 400 for an invalid email address", async () => {
    const res = await POST(
      new Request("https://example.com/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "SecurePass123!" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.email).toBeDefined();
  });

  it("returns 400 when password is too short", async () => {
    const res = await POST(
      new Request("https://example.com/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "short" }), // < 8 chars
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.password).toBeDefined();
  });

  it("returns 500 when the email-uniqueness DB check throws", async () => {
    mockUserFindFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(new Request("https://example.com/api/account", VALID_POST));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 409 when email is already registered", async () => {
    mockUserFindFirst.mockResolvedValue({ id: "existing-1", email: "alice@example.com" });
    const res = await POST(new Request("https://example.com/api/account", VALID_POST));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.email).toBeDefined();
  });

  it("returns 500 when the DB insert throws", async () => {
    // mockInsert set fresh here (no beforeEach seed) so mockReturnValue takes effect immediately
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("constraint violation")),
        }),
      }),
    });
    const res = await POST(new Request("https://example.com/api/account", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("returns 409 when onConflictDoNothing resolves empty (concurrent duplicate)", async () => {
    // Two simultaneous POSTs both pass the findFirst check; one loses the DB race
    // and gets an empty returning[] — should surface as 409, not 500.
    setupInserts([]); // empty means the insert was suppressed by the conflict guard
    const res = await POST(new Request("https://example.com/api/account", VALID_POST));
    expect(res.status).toBe(409);
  });

  it("returns 201 and schedules welcome emails on successful registration", async () => {
    setupInserts([{ id: "user-1" }]);
    const res = await POST(new Request("https://example.com/api/account", VALID_POST));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockHashPassword).toHaveBeenCalledWith("SecurePass123!");
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1);
    await mockRunAfterResponse.mock.calls[0][0]();
    expect(mockEnqueueWelcomeEmails).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
  });
});

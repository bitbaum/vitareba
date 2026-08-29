/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSession,
  mockUserFindFirst,
  mockUpdate,
  mockHashPassword,
  mockVerifyPassword,
  mockIsUserLocked,
  mockNextLoginAttemptState,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockHashPassword: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockIsUserLocked: vi.fn(),
  mockNextLoginAttemptState: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findFirst: mockUserFindFirst } },
    update: mockUpdate,
  },
}));

vi.mock("@/lib/domain/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/auth")>();
  return {
    ...actual,
    hashPassword: mockHashPassword,
    verifyPassword: mockVerifyPassword,
    isUserLocked: mockIsUserLocked,
    nextLoginAttemptState: mockNextLoginAttemptState,
  };
});

import { POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = {
  session: { user: { id: "user-1", role: "patient", email: "alice@example.com" } },
  error: null,
};
const UNAUTH = { session: null, error: new Response(null, { status: 401 }) };

const USER_WITH_PASSWORD = {
  password: "$2b$12$hashedcurrentpassword",
  failedLoginAttempts: 0,
  lockedUntil: null,
};

const VALID_BODY = { currentPassword: "OldPassword1!", newPassword: "NewPassword2@" };
const VALID_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(VALID_BODY),
};

// Reusable helper — sets up update mock for the success path (no .returning())
function setupUpdate() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockUserFindFirst.mockReset();
    mockUpdate.mockReset();
    mockHashPassword.mockReset();
    mockVerifyPassword.mockReset();
    mockIsUserLocked.mockReset();
    mockNextLoginAttemptState.mockReset();

    // Defaults: authenticated, unlocked user with a password, correct current password
    mockRequireSession.mockResolvedValue(SESSION);
    mockUserFindFirst.mockResolvedValue(USER_WITH_PASSWORD);
    mockIsUserLocked.mockReturnValue(false);
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("$2b$12$newhashedpassword");
    mockNextLoginAttemptState.mockReturnValue({ failedLoginAttempts: 1, lockedUntil: null });
    setupUpdate();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue(UNAUTH);
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    const res = await POST(
      new Request("https://example.com/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "OldPassword1!" }), // newPassword missing
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword is shorter than the minimum", async () => {
    const res = await POST(
      new Request("https://example.com/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "OldPassword1!", newPassword: "short" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the user lookup DB call throws", async () => {
    mockUserFindFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("returns 400 when the account has no password (OAuth-only account)", async () => {
    mockUserFindFirst.mockResolvedValue({ ...USER_WITH_PASSWORD, password: null });
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no password/i);
  });

  it("returns 400 when the user record is not found", async () => {
    mockUserFindFirst.mockResolvedValue(undefined);
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(400);
  });

  it("returns 429 when the account is locked out", async () => {
    mockIsUserLocked.mockReturnValue(true);
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/too many attempts/i);
  });

  it("returns 401 and records the failed attempt when current password is wrong", async () => {
    mockVerifyPassword.mockResolvedValue(false);
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/incorrect/i);
    // Failed attempt state must be persisted
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockNextLoginAttemptState).toHaveBeenCalledWith(USER_WITH_PASSWORD, false);
  });

  it("returns 500 when the password-update DB call throws", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("hashes the new password, clears lockout state, and returns 200", async () => {
    const res = await POST(new Request("https://example.com/api/auth/change-password", VALID_POST));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mockHashPassword).toHaveBeenCalledWith(VALID_BODY.newPassword);

    // Verify update called with new hash and cleared lockout
    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({
      password: "$2b$12$newhashedpassword",
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  });
});

/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTokenFindFirst, mockUpdate, mockDelete, mockHashPassword } = vi.hoisted(() => ({
  mockTokenFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockHashPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { verificationTokens: { findFirst: mockTokenFindFirst } },
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock("@/lib/domain/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/auth")>();
  return { ...actual, hashPassword: mockHashPassword };
});

import { POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_BODY = {
  token: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1", // 64-char hex token
  email: "alice@example.com",
  password: "NewSecurePass123!",
};

const VALID_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(VALID_BODY),
};

const TOKEN_RECORD = {
  identifier: "reset:alice@example.com",
  token: VALID_BODY.token,
  expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    mockTokenFindFirst.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockHashPassword.mockReset();
    mockHashPassword.mockResolvedValue("$2b$12$newhashedpassword");
    mockTokenFindFirst.mockResolvedValue(TOKEN_RECORD);
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    });
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
  });

  it("returns 400 when the token is missing from the request body", async () => {
    const res = await POST(
      new Request("https://example.com/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "NewSecurePass123!" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the password is too short", async () => {
    const res = await POST(
      new Request("https://example.com/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, password: "short" }), // < 8 chars
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the token-lookup DB call throws", async () => {
    mockTokenFindFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(new Request("https://example.com/api/auth/reset-password", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("returns 400 when the token does not exist or has expired", async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    const res = await POST(new Request("https://example.com/api/auth/reset-password", VALID_POST));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid|expired/i);
  });

  it("returns 500 when the password-update DB call throws", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const res = await POST(new Request("https://example.com/api/auth/reset-password", VALID_POST));
    expect(res.status).toBe(500);
  });

  it("updates password, clears lockout state, deletes token, and returns 200", async () => {
    const res = await POST(new Request("https://example.com/api/auth/reset-password", VALID_POST));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mockHashPassword).toHaveBeenCalledWith("NewSecurePass123!");
    // Password update called with cleared lockout fields
    const setArgs = mockUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({
      password: "$2b$12$newhashedpassword",
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    // Token consumed — deleted after use
    expect(mockDelete).toHaveBeenCalled();
  });
});

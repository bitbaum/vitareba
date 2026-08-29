/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RESET_TOKEN_EXPIRY_MS, RESET_RATE_LIMIT_MS } from "@/lib/config/auth";

const {
  mockUserFindFirst,
  mockTokenFindFirst,
  mockInsert,
  mockDelete,
  mockSendEmail,
  mockIsEmailConfigured,
} = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockTokenFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockSendEmail: vi.fn(),
  mockIsEmailConfigured: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst },
      verificationTokens: { findFirst: mockTokenFindFirst },
    },
    insert: mockInsert,
    delete: mockDelete,
  },
}));

vi.mock("@/lib/email/index", () => ({
  sendEmail: mockSendEmail,
  isEmailConfigured: mockIsEmailConfigured,
}));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return { ...actual, PORTAL_URL: "https://portal.example.com" };
});

import { POST } from "./route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// User with a password hash — eligible for reset
const USER_WITH_PASSWORD = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  password: "$2b$12$hashed",
};

function makeRequest(email?: string) {
  return new Request("https://example.com/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email !== undefined ? { email } : {}),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    mockUserFindFirst.mockReset();
    mockTokenFindFirst.mockReset();
    mockInsert.mockReset();
    mockDelete.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ sent: true });
    mockIsEmailConfigured.mockReset();
    mockIsEmailConfigured.mockReturnValue(true);
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue({}) });
    mockTokenFindFirst.mockResolvedValue(null); // no prior token by default
  });

  // Anti-enumeration: all responses are 200 regardless of outcome.
  // Side effects (email sent / not sent) are what distinguish paths.

  // The one deliberate exception: provider unconfigured is a server-wide
  // condition checked before any user lookup — a uniform 503 leaks nothing
  // and prevents the "check your inbox" lie that silently locks patients out.
  it("returns 503 before any user lookup when the email provider is unconfigured", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(503);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 for an invalid email format and does not send email", async () => {
    const res = await POST(makeRequest("not-an-email"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("returns 200 when no account exists for the email", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 for an OAuth-only account with no password", async () => {
    mockUserFindFirst.mockResolvedValue({ ...USER_WITH_PASSWORD, password: null });
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 when the user-lookup DB call throws", async () => {
    mockUserFindFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 and does not send email when within the rate-limit window", async () => {
    mockUserFindFirst.mockResolvedValue(USER_WITH_PASSWORD);
    // Token expires in 1 hour from now → was just created → within RESET_RATE_LIMIT_MS
    const recentExpiry = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS);
    mockTokenFindFirst.mockResolvedValue({ expires: recentExpiry });
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 200 when token DB operations throw (does not expose the failure)", async () => {
    mockUserFindFirst.mockResolvedValue(USER_WITH_PASSWORD);
    mockDelete.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
  });

  it("sends a reset email when the account exists and has a password", async () => {
    mockUserFindFirst.mockResolvedValue(USER_WITH_PASSWORD);
    // No prior token → skip rate-limit check
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: expect.stringContaining("password"),
      }),
    );
    // Token saved to DB
    expect(mockInsert).toHaveBeenCalled();
  });

  it("deletes stale token and sends new email when rate-limit window has passed", async () => {
    mockUserFindFirst.mockResolvedValue(USER_WITH_PASSWORD);
    // Token expires in 1 hour but was created RESET_RATE_LIMIT_MS + 1 min ago → old enough
    const oldExpiry = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS - RESET_RATE_LIMIT_MS - 60_000,
    );
    mockTokenFindFirst.mockResolvedValue({ expires: oldExpiry });
    const res = await POST(makeRequest("alice@example.com"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@example.com" }),
    );
  });
});

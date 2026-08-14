/// <reference types="vitest/globals" />
import {
  loginSchema,
  registerSchema,
  resolveRole,
  hashPassword,
  verifyPassword,
  isUserLocked,
  nextLoginAttemptState,
  sanitizeReturnTo,
  emailField,
  shouldRevalidateSession,
  revalidatedSessionToken,
} from "./auth";
import { SESSION_REVALIDATE_MS, USER_ROLE } from "@/lib/config/auth";
import { z } from "zod";

// bcrypt cost 12 is intentionally slow (production security); use 4 in tests
vi.mock("@/lib/config/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/auth")>();
  return { ...actual, BCRYPT_SALT_ROUNDS: 4 };
});
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_DURATION_MS,
} from "@/lib/config/auth";

// ─── loginSchema ──────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "abc" }).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(loginSchema.safeParse({ email: "notanemail", password: "abc" }).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });

  it("rejects email over EMAIL_MAX_LENGTH", () => {
    const longEmail = "a".repeat(EMAIL_MAX_LENGTH) + "@x.com"; // total > EMAIL_MAX_LENGTH
    expect(loginSchema.safeParse({ email: longEmail, password: "abc" }).success).toBe(false);
  });

  it("rejects password over PASSWORD_MAX_LENGTH", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "a".repeat(PASSWORD_MAX_LENGTH + 1) }).success
    ).toBe(false);
  });

  it("accepts password at exactly PASSWORD_MAX_LENGTH", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "a".repeat(PASSWORD_MAX_LENGTH) }).success
    ).toBe(true);
  });
});

// ─── registerSchema ───────────────────────────────────────────────────────────

describe("registerSchema", () => {
  it("accepts valid email and password at exactly minimum length", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("accepts password above minimum length", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(PASSWORD_MIN_LENGTH + 4),
    });
    expect(result.success).toBe(true);
  });

  it("rejects password below minimum length", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "bad-email",
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });
    expect(result.success).toBe(false);
  });

  it("rejects password over PASSWORD_MAX_LENGTH", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects email over EMAIL_MAX_LENGTH", () => {
    const longEmail = "a".repeat(EMAIL_MAX_LENGTH) + "@x.com"; // total > EMAIL_MAX_LENGTH
    const result = registerSchema.safeParse({
      email: longEmail,
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });
    expect(result.success).toBe(false);
  });
});

// ─── resolveRole ──────────────────────────────────────────────────────────────

describe("resolveRole", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@example.com,boss@clinic.ch";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("returns 'admin' for a known admin email", () => {
    expect(resolveRole("admin@example.com")).toBe("admin");
  });

  it("returns 'admin' for a second admin email", () => {
    expect(resolveRole("boss@clinic.ch")).toBe("admin");
  });

  it("returns 'patient' for an unknown email", () => {
    expect(resolveRole("patient@example.com")).toBe("patient");
  });

  it("keeps a DB-granted admin role even when the email is not env-listed (promote-only)", () => {
    expect(resolveRole("dualrole@clinic.ch", "admin")).toBe("admin");
  });

  it("is case-insensitive for admin email check", () => {
    expect(resolveRole("ADMIN@EXAMPLE.COM")).toBe("admin");
    expect(resolveRole("Boss@Clinic.ch")).toBe("admin");
  });

  it("returns 'patient' when ADMIN_EMAILS is empty", () => {
    process.env.ADMIN_EMAILS = "";
    expect(resolveRole("anyone@example.com")).toBe("patient");
  });
});

// ─── hashPassword / verifyPassword ────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a bcrypt hash (starts with $2b$)", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("produces a different hash each call (salted)", async () => {
    const h1 = await hashPassword("secret123");
    const h2 = await hashPassword("secret123");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  it("returns true for a matching password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

// ─── isUserLocked ─────────────────────────────────────────────────────────────

describe("isUserLocked", () => {
  const NOW = new Date("2026-04-25T12:00:00.000Z");

  it("returns false when lockedUntil is null", () => {
    expect(isUserLocked({ lockedUntil: null }, NOW)).toBe(false);
  });

  it("returns true when lockedUntil is in the future", () => {
    const future = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(isUserLocked({ lockedUntil: future }, NOW)).toBe(true);
  });

  it("returns false when lockedUntil is in the past (lockout expired)", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(isUserLocked({ lockedUntil: past }, NOW)).toBe(false);
  });

  it("returns false when lockedUntil equals now (boundary: not strictly in the future)", () => {
    expect(isUserLocked({ lockedUntil: NOW }, NOW)).toBe(false);
  });
});

// ─── nextLoginAttemptState ────────────────────────────────────────────────────

describe("nextLoginAttemptState", () => {
  const NOW = new Date("2026-04-25T12:00:00.000Z");

  describe("on success", () => {
    it("resets counter and clears lockout regardless of prior failedLoginAttempts", () => {
      expect(nextLoginAttemptState({ failedLoginAttempts: 0 }, true, NOW)).toEqual({
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      expect(nextLoginAttemptState({ failedLoginAttempts: 3 }, true, NOW)).toEqual({
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    });
  });

  describe("on failure below threshold", () => {
    it("increments counter and leaves lockedUntil null", () => {
      expect(nextLoginAttemptState({ failedLoginAttempts: 0 }, false, NOW)).toEqual({
        failedLoginAttempts: 1,
        lockedUntil: null,
      });
      expect(nextLoginAttemptState({ failedLoginAttempts: 2 }, false, NOW)).toEqual({
        failedLoginAttempts: 3,
        lockedUntil: null,
      });
    });

    it("counter just below threshold increments without locking", () => {
      const result = nextLoginAttemptState(
        { failedLoginAttempts: LOGIN_LOCKOUT_THRESHOLD - 2 },
        false,
        NOW
      );
      expect(result.failedLoginAttempts).toBe(LOGIN_LOCKOUT_THRESHOLD - 1);
      expect(result.lockedUntil).toBeNull();
    });
  });

  describe("on failure that hits the threshold", () => {
    it("resets counter to 0 and sets lockedUntil = now + LOGIN_LOCKOUT_DURATION_MS", () => {
      const result = nextLoginAttemptState(
        { failedLoginAttempts: LOGIN_LOCKOUT_THRESHOLD - 1 },
        false,
        NOW
      );
      expect(result.failedLoginAttempts).toBe(0);
      expect(result.lockedUntil).not.toBeNull();
      expect(result.lockedUntil!.getTime()).toBe(NOW.getTime() + LOGIN_LOCKOUT_DURATION_MS);
    });

    it("triggers lockout on the Nth failure (where N = LOGIN_LOCKOUT_THRESHOLD)", () => {
      let state: { failedLoginAttempts: number; lockedUntil: Date | null } = {
        failedLoginAttempts: 0,
        lockedUntil: null,
      };
      for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD - 1; i++) {
        state = nextLoginAttemptState(state, false, NOW);
        expect(state.lockedUntil).toBeNull();
      }
      state = nextLoginAttemptState(state, false, NOW);
      expect(state.lockedUntil).not.toBeNull();
    });
  });
});

// ─── sanitizeReturnTo ─────────────────────────────────────────────────────────
// Open-redirect defence: login/register pages send the user to ?returnTo after
// auth. Without sanitisation, ?returnTo=https://evil.com would phish the user.

describe("sanitizeReturnTo", () => {
  const FALLBACK = "/dashboard";

  describe("rejects (returns fallback)", () => {
    it("absolute http URL", () => {
      expect(sanitizeReturnTo("http://evil.com/x", FALLBACK)).toBe(FALLBACK);
    });

    it("absolute https URL", () => {
      expect(sanitizeReturnTo("https://evil.com/x", FALLBACK)).toBe(FALLBACK);
    });

    it("protocol-relative URL (//evil.com)", () => {
      expect(sanitizeReturnTo("//evil.com/x", FALLBACK)).toBe(FALLBACK);
    });

    it("Windows-style backslash redirect (/\\evil.com)", () => {
      expect(sanitizeReturnTo("/\\evil.com", FALLBACK)).toBe(FALLBACK);
    });

    it("javascript: scheme", () => {
      expect(sanitizeReturnTo("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
    });

    it("data: scheme", () => {
      expect(sanitizeReturnTo("data:text/html,<script>alert(1)</script>", FALLBACK)).toBe(FALLBACK);
    });

    it("relative path without leading slash", () => {
      expect(sanitizeReturnTo("dashboard", FALLBACK)).toBe(FALLBACK);
    });

    it("empty string", () => {
      expect(sanitizeReturnTo("", FALLBACK)).toBe(FALLBACK);
    });

    it("null", () => {
      expect(sanitizeReturnTo(null, FALLBACK)).toBe(FALLBACK);
    });

    it("undefined", () => {
      expect(sanitizeReturnTo(undefined, FALLBACK)).toBe(FALLBACK);
    });
  });

  describe("accepts (returns input)", () => {
    it("simple same-origin path", () => {
      expect(sanitizeReturnTo("/dashboard", FALLBACK)).toBe("/dashboard");
    });

    it("nested path", () => {
      expect(sanitizeReturnTo("/messages/abc-123", FALLBACK)).toBe("/messages/abc-123");
    });

    it("path with query string", () => {
      expect(sanitizeReturnTo("/admin/patients?signal=critical", FALLBACK)).toBe(
        "/admin/patients?signal=critical"
      );
    });

    it("path with hash fragment", () => {
      expect(sanitizeReturnTo("/checkin#today", FALLBACK)).toBe("/checkin#today");
    });

    it("locale-prefixed path", () => {
      expect(sanitizeReturnTo("/de/login", FALLBACK)).toBe("/de/login");
    });
  });
});

// ─── emailField (case-normalisation) ──────────────────────────────────────────
// Real bug fixed here: emails were stored & looked up case-sensitively, so
// "Alice@x.com" and "alice@x.com" could become two separate accounts and
// case-mismatched logins/lookups failed silently.

describe("emailField", () => {
  const schema = z.object({ email: emailField() });

  it("accepts a valid lowercase email and passes it through", () => {
    const result = schema.safeParse({ email: "alice@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@example.com");
  });

  it("normalises an uppercase local part to lowercase", () => {
    const result = schema.safeParse({ email: "ALICE@example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@example.com");
  });

  it("normalises a mixed-case domain to lowercase", () => {
    const result = schema.safeParse({ email: "alice@EXAMPLE.COM" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@example.com");
  });

  it("normalises both parts and yields one canonical value", () => {
    const aliceCaps = schema.safeParse({ email: "Alice.Smith@Example.Com" });
    const aliceLower = schema.safeParse({ email: "alice.smith@example.com" });
    expect(aliceCaps.success && aliceLower.success).toBe(true);
    if (aliceCaps.success && aliceLower.success) {
      expect(aliceCaps.data.email).toBe(aliceLower.data.email);
    }
  });

  it("rejects malformed emails before transform runs", () => {
    expect(schema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("supports a custom invalid-message", () => {
    const customSchema = z.object({ email: emailField({ invalidMessage: "Boom" }) });
    const result = customSchema.safeParse({ email: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Boom");
    }
  });
});

describe("loginSchema (uses emailField)", () => {
  it("normalises email to lowercase", () => {
    const result = loginSchema.safeParse({ email: "Alice@Example.com", password: "abc" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@example.com");
  });
});

describe("registerSchema (uses emailField)", () => {
  it("normalises email to lowercase", () => {
    const result = registerSchema.safeParse({
      email: "Alice@Example.com",
      password: "12345678",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("alice@example.com");
  });
});

// ─── Session revalidation ─────────────────────────────────────────────────────
// A JWT session is self-contained, so deleting or demoting a user in the
// database does not by itself stop their session. These cover the mechanism
// that closes that window.

describe("shouldRevalidateSession", () => {
  const NOW = 1_700_000_000_000;

  it("checks a token that has never been checked", () => {
    // Tokens issued before this mechanism existed carry no checkedAt — they are
    // exactly the sessions most likely to be stale.
    expect(shouldRevalidateSession({}, NOW)).toBe(true);
  });

  it("skips a token checked within the interval", () => {
    expect(shouldRevalidateSession({ checkedAt: NOW - 1000 }, NOW)).toBe(false);
  });

  it("checks a token once the interval has elapsed", () => {
    expect(shouldRevalidateSession({ checkedAt: NOW - SESSION_REVALIDATE_MS }, NOW)).toBe(true);
  });

  it("checks a token stamped in the future", () => {
    // A backwards clock correction must not park a token beyond every check.
    expect(shouldRevalidateSession({ checkedAt: NOW + 60_000 }, NOW)).toBe(true);
  });

  it("checks a token whose stamp is not a number", () => {
    expect(shouldRevalidateSession({ checkedAt: "recently" }, NOW)).toBe(true);
  });
});

describe("revalidatedSessionToken", () => {
  const NOW = 1_700_000_000_000;
  const token = { id: "u1", role: USER_ROLE.admin, emailVerified: null, checkedAt: NOW - 1 };
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("ends the session when the user row is gone", () => {
    expect(revalidatedSessionToken(token, null, NOW)).toBeNull();
    expect(revalidatedSessionToken(token, undefined, NOW)).toBeNull();
  });

  it("demotes a session whose database role was revoked", () => {
    const next = revalidatedSessionToken(
      token,
      { email: "patient@example.com", role: USER_ROLE.patient, emailVerified: null },
      NOW
    );
    expect(next?.role).toBe(USER_ROLE.patient);
    expect(next?.checkedAt).toBe(NOW);
  });

  it("keeps an env-listed admin admin even if the row says patient", () => {
    // resolveRole is promote-only — ADMIN_EMAILS is the recovery path and must
    // survive revalidation, or a lagging row would lock the owner out.
    const next = revalidatedSessionToken(
      token,
      { email: "admin@example.com", role: USER_ROLE.patient, emailVerified: null },
      NOW
    );
    expect(next?.role).toBe(USER_ROLE.admin);
  });

  it("refreshes email verification from the row", () => {
    const verifiedAt = new Date(NOW);
    const next = revalidatedSessionToken(
      token,
      { email: "p@example.com", role: USER_ROLE.patient, emailVerified: verifiedAt },
      NOW
    );
    expect(next?.emailVerified).toBe(verifiedAt);
  });

  it("keeps the session alive, unstamped, when the lookup failed", () => {
    // An unreachable database is not evidence the user was deleted, and must
    // not sign the whole clinic out.
    const next = revalidatedSessionToken(token, null, NOW, true);
    expect(next).toBe(token);
    expect(next?.checkedAt).toBe(NOW - 1);
  });
});

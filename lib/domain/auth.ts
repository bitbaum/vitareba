import { z } from "zod";
import bcrypt from "bcryptjs";
import { getAdminEmails } from "@/lib/config/company";
import {
  USER_ROLE,
  type UserRole,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  BCRYPT_SALT_ROUNDS,
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_DURATION_MS,
} from "@/lib/config/auth";

/**
 * Reusable email field — validates RFC-style format and length, then normalises
 * to lowercase so "Alice@x.com" and "alice@x.com" can never coexist as
 * separate accounts and case-mismatched logins/lookups don't fail silently.
 * Use this in every schema that accepts an email from the client.
 */
export function emailField(opts: { invalidMessage?: string } = {}) {
  return z
    .string()
    .email(opts.invalidMessage ?? "Invalid email")
    .max(EMAIL_MAX_LENGTH)
    .transform((s) => s.toLowerCase());
}

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const registerSchema = z.object({
  email: emailField({ invalidMessage: "Invalid email address" }),
  password: z.string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH),
});

/**
 * Effective role at sign-in. ADMIN_EMAILS is a bootstrap/recovery PROMOTION
 * list — being on it grants admin even if the DB row lags. It never demotes:
 * the database is the SSOT for roles granted in-product (e.g. dual-role
 * clinicians managed via SQL/admin tooling, not env vars).
 */
export function resolveRole(email: string, dbRole: UserRole = USER_ROLE.patient): UserRole {
  const adminEmails = getAdminEmails().map((e) => e.toLowerCase());
  if (adminEmails.includes(email.toLowerCase())) return USER_ROLE.admin;
  return dbRole;
}

/** Hash a plaintext password using the project's standard bcrypt cost factor */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/** Compare a plaintext password against a stored bcrypt hash */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Open-redirect prevention ─────────────────────────────────────────────────

/**
 * Sanitize a `returnTo` query parameter from the login/register flow so it
 * can never redirect a logged-in user to an attacker-controlled URL.
 *
 * Accepts only same-origin paths: must start with a single `/` and must NOT
 * start with `//` (protocol-relative) or `/\` (Windows-style). Anything else
 * (full URLs, missing leading slash, empty/null) collapses to the fallback.
 */
export function sanitizeReturnTo(
  input: string | null | undefined,
  fallback: string
): string {
  if (typeof input !== "string" || input.length === 0) return fallback;
  if (input[0] !== "/") return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  return input;
}

// ─── Brute-force protection ───────────────────────────────────────────────────

/** True when the user is currently locked out from logging in. */
export function isUserLocked(
  user: { lockedUntil: Date | null },
  now: Date = new Date()
): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

/**
 * Pure state transition for a login attempt outcome.
 * - Success → reset counter and clear any prior lockout.
 * - Failure below threshold → increment counter.
 * - Failure that hits threshold → reset counter to 0 and set lockedUntil = now + duration.
 */
export function nextLoginAttemptState(
  current: { failedLoginAttempts: number },
  success: boolean,
  now: Date = new Date()
): { failedLoginAttempts: number; lockedUntil: Date | null } {
  if (success) return { failedLoginAttempts: 0, lockedUntil: null };
  const next = current.failedLoginAttempts + 1;
  if (next >= LOGIN_LOCKOUT_THRESHOLD) {
    return {
      failedLoginAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOGIN_LOCKOUT_DURATION_MS),
    };
  }
  return { failedLoginAttempts: next, lockedUntil: null };
}

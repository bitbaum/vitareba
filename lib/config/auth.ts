// Auth constants — SSOT for all auth-related magic numbers

/** User role values — mirrors pgEnum("role") in schema */
export const USER_ROLE_VALUES = ["patient", "admin"] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];

/** Named constants for user role values — use in comparisons instead of string literals */
export const USER_ROLE = {
  patient: "patient",
  admin: "admin",
} as const satisfies Record<UserRole, UserRole>;

/**
 * How long (ms) a session may go without being checked against the users table.
 *
 * JWT sessions are self-contained: nothing in the token knows the row it came
 * from was deleted or demoted, so without this a revoked admin keeps admin
 * until the cookie expires. Re-reading the row on every request would put a
 * query in front of every page; this bounds the staleness window instead.
 */
export const SESSION_REVALIDATE_MS = 5 * 60 * 1000; // 5 minutes

/** bcrypt cost factor used for password hashing — applies to registration, reset, and change-password */
export const BCRYPT_SALT_ROUNDS = 12;

/** Minimum password length — enforced at registration, reset, and change-password */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Maximum password length — bounded to prevent bcrypt DoS via extremely long inputs.
 * bcrypt truncates at 72 bytes internally; 200 chars is generous and safe.
 */
export const PASSWORD_MAX_LENGTH = 200;

/** Maximum email length — matches email varchar(255) DB column */
export const EMAIL_MAX_LENGTH = 255;

/** How long (ms) a password-reset token remains valid */
export const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/** Max length for a password-reset token string (hex-encoded 32 bytes = 64 chars; 512 gives headroom) */
export const PASSWORD_RESET_TOKEN_MAX_LENGTH = 512;

/** Prefix used as the verificationTokens.identifier for password-reset entries */
export const RESET_TOKEN_IDENTIFIER_PREFIX = "reset:";

/**
 * Minimum time (ms) between password-reset email sends for the same address.
 * Inferred from the existing token's `expires` field: created_at ≈ expires − EXPIRY_MS.
 * Prevents email-bombing without requiring any external rate-limit infrastructure.
 */
export const RESET_RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Number of consecutive failed login attempts before the account is locked.
 * Counter resets to 0 on successful login or when a lockout is triggered.
 */
export const LOGIN_LOCKOUT_THRESHOLD = 5;

/**
 * How long (ms) an account stays locked after hitting LOGIN_LOCKOUT_THRESHOLD
 * consecutive failed attempts. During this window, even the correct password is denied.
 */
export const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

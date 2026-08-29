export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email/templates";
import { PORTAL_URL, COMPANY } from "@/lib/config/company";
import {
  PASSWORD_RESET_TOKEN_EXPIRY_MS,
  RESET_RATE_LIMIT_MS,
  RESET_TOKEN_IDENTIFIER_PREFIX,
} from "@/lib/config/auth";
import { emailField } from "@/lib/domain/auth";

const schema = z.object({ email: emailField() });
// Always return the same response to prevent email enumeration
const OK = NextResponse.json({ success: true });

export async function POST(req: Request) {
  // Provider unconfigured is a server-wide condition checked BEFORE any user
  // lookup, so this 503 is uniform for every request and leaks nothing about
  // account existence. Without it, "check your inbox" is a lie and the
  // patient is silently locked out.
  if (!isEmailConfigured()) {
    console.error("[api/auth/forgot-password] email provider not configured — reset unavailable");
    return NextResponse.json(
      { success: false, error: "Password reset temporarily unavailable" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return OK;

  const { email } = parsed.data;

  let user;
  try {
    user = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true, name: true, email: true, password: true },
    });
  } catch (err) {
    // Log but still return OK — never reveal whether the email exists or the DB failed
    console.error("[api/auth/forgot-password] user lookup failed:", err);
    return OK;
  }

  // No account or OAuth-only account (no password set) → silently do nothing
  if (!user?.password) return OK;

  // Rate-limit: infer when the existing token was created (created ≈ expires − EXPIRY_MS).
  // If it was created within RESET_RATE_LIMIT_MS, silently do nothing — prevents email bombing.
  try {
    const existing = await db.query.verificationTokens.findFirst({
      where: eq(verificationTokens.identifier, `${RESET_TOKEN_IDENTIFIER_PREFIX}${email}`),
      columns: { expires: true },
    });
    if (existing) {
      const createdAt = existing.expires.getTime() - PASSWORD_RESET_TOKEN_EXPIRY_MS;
      if (Date.now() - createdAt < RESET_RATE_LIMIT_MS) return OK;
    }
  } catch (err) {
    console.error("[api/auth/forgot-password] rate-limit check failed:", err);
    return OK;
  }

  // Invalidate any existing reset token for this email
  try {
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, `${RESET_TOKEN_IDENTIFIER_PREFIX}${email}`));

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS);

    await db.insert(verificationTokens).values({
      identifier: `${RESET_TOKEN_IDENTIFIER_PREFIX}${email}`,
      token,
      expires,
    });

    const resetUrl = `${PORTAL_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: `Reset your ${COMPANY.shortName} password`,
      html: passwordResetEmail({ resetUrl }),
    });
  } catch (err) {
    // Log but still return OK — never reveal whether the email exists or the operation failed
    console.error("[api/auth/forgot-password] failed:", err);
  }

  return OK;
}

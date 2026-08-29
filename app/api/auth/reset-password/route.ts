export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { serviceUnavailable } from "@/lib/utils/api-response";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RESET_TOKEN_MAX_LENGTH,
  RESET_TOKEN_IDENTIFIER_PREFIX,
} from "@/lib/config/auth";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";
import { hashPassword, emailField } from "@/lib/domain/auth";

const schema = z.object({
  token: z.string().min(1).max(PASSWORD_RESET_TOKEN_MAX_LENGTH),
  email: emailField(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid data", code: "invalid_data" },
      { status: 400 },
    );
  }

  const { token, email, password } = parsed.data;

  let record;
  try {
    record = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.identifier, `${RESET_TOKEN_IDENTIFIER_PREFIX}${email}`),
        eq(verificationTokens.token, token),
        gt(verificationTokens.expires, new Date()),
      ),
    });
  } catch (err) {
    console.error("[api/auth/reset-password] token lookup failed:", err);
    return serviceUnavailable();
  }

  if (!record) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired link", code: "invalid_token" },
      { status: 400 },
    );
  }

  const hashed = await hashPassword(password);
  try {
    // Also clear the brute-force lockout state — a user who was locked out and
    // recovered via the reset-password flow must not be told the new password
    // works only after the 15-min lockout window expires.
    await db
      .update(users)
      .set({ password: hashed, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.email, email));
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, `${RESET_TOKEN_IDENTIFIER_PREFIX}${email}`));
  } catch (err) {
    console.error("[api/auth/reset-password] update failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reset password — please try again",
        code: "server_error",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
